import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { openFormPage, closeSession, BrowserSession } from "../browser";
import { fillField } from "../fields";
import { inspectElement } from "../inspect";
import { performWaits } from "../waits";
import { FieldType, WaitCondition } from "../types";
import { SessionEntry } from "./server";

const FIELD_TYPES = [
  "text",
  "email",
  "phone",
  "password",
  "number",
  "select",
  "checkbox",
  "radio",
  "textarea",
  "date",
  "file",
] as const satisfies readonly FieldType[];

const waitConditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("selector"),
    selector: z.string(),
    state: z.enum(["visible", "attached", "hidden", "detached"]).optional(),
  }),
  z.object({
    type: z.literal("value"),
    selector: z.string(),
    equals: z.string().optional(),
    notEmpty: z.boolean().optional(),
  }),
  z.object({ type: z.literal("timeout"), ms: z.number() }),
]);

function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

function toolText(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function toolJson(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/**
 * Looks up a session by ID, throwing a descriptive error (caught by every
 * caller and turned into a graceful tool error, never an uncaught
 * exception) if it doesn't exist — whether it was never opened, already
 * closed, or auto-closed after sitting idle. Bumps `lastUsed` on every
 * successful lookup so the idle-timeout only fires on genuinely unused
 * sessions.
 */
function getSession(sessions: Map<string, SessionEntry>, sessionId: string): BrowserSession {
  const entry = sessions.get(sessionId);
  if (!entry) {
    throw new Error(
      `No open session with ID "${sessionId}" (it may not exist, may already be closed, or may have been auto-closed after being idle)`
    );
  }
  entry.lastUsed = Date.now();
  return entry.session;
}

interface DiscoveredField {
  selector: string;
  tagName: string;
  type: string;
  name: string;
  label: string;
  value: string;
  required: boolean;
}

/**
 * Registers the interactive, session-based tools: open a page, discover
 * fields, fill/click/inspect/wait, read page text, close the session. For
 * AI-driven exploratory form filling without a pre-written config — the
 * config-driven batch tools (validate_form_config/run_form_test/
 * run_multistep_form_test) land in increment 19.
 */
export function registerSessionTools(server: McpServer, sessions: Map<string, SessionEntry>): void {
  server.registerTool(
    "open_session",
    {
      description:
        "Opens a browser session at the given URL. Returns a sessionId to pass to every other session-scoped tool. Call close_session when done. Pass storageState to start already logged in (a Playwright storage-state file path, or the state as an inline object) instead of a fresh/logged-out session.",
      inputSchema: {
        url: z.string().describe("URL of the page to open"),
        headless: z.boolean().optional().describe("Run headless (default true)"),
        storageState: z
          .union([z.string(), z.record(z.string(), z.unknown())])
          .optional()
          .describe("Reuse a saved session (cookies + localStorage): a file path, or the state as an inline object"),
      },
    },
    async ({ url, headless, storageState }) => {
      try {
        const session = await openFormPage(url, { headless, storageState });
        const sessionId = randomUUID();
        sessions.set(sessionId, { session, lastUsed: Date.now() });
        return toolJson({ sessionId });
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "close_session",
    {
      description: "Closes a browser session opened with open_session, freeing its resources.",
      inputSchema: { sessionId: z.string() },
    },
    async ({ sessionId }) => {
      const entry = sessions.get(sessionId);
      if (!entry) {
        return toolError(new Error(`No open session with ID "${sessionId}"`));
      }
      try {
        await closeSession(entry.session);
      } finally {
        sessions.delete(sessionId);
      }
      return toolText(`Session "${sessionId}" closed`);
    }
  );

  server.registerTool(
    "discover_fields",
    {
      description:
        "Best-effort scan of the page (or a scoped container) for form fields (input/select/textarea): a usable selector, type, name, label, current value, and whether required. Selectors are a heuristic (prefers #id, falls back to [name=...] or a positional CSS path) — not guaranteed unique or stable; verify with inspect_element before relying on one for a critical action.",
      inputSchema: {
        sessionId: z.string(),
        withinSelector: z.string().optional().describe("Optional selector to scope discovery to, e.g. a dialog container"),
      },
    },
    async ({ sessionId, withinSelector }) => {
      try {
        const page = getSession(sessions, sessionId).page;
        const fields = await page.evaluate((scopeSelector: string | undefined): DiscoveredField[] => {
          const root: ParentNode | null = scopeSelector ? document.querySelector(scopeSelector) : document;
          if (!root) return [];

          function cssSelectorFor(el: Element): string {
            if (el.id) return `#${el.id}`;
            const name = el.getAttribute("name");
            if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
            const parent = el.parentElement;
            if (!parent) return el.tagName.toLowerCase();
            const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
            const index = siblings.indexOf(el) + 1;
            return `${cssSelectorFor(parent)} > ${el.tagName.toLowerCase()}:nth-of-type(${index})`;
          }

          function labelFor(el: Element): string {
            const id = (el as HTMLElement).id;
            if (id) {
              const labelled = document.querySelector(`label[for="${id}"]`);
              if (labelled) return (labelled.textContent ?? "").trim();
            }
            const wrapping = el.closest("label");
            return wrapping ? (wrapping.textContent ?? "").trim() : "";
          }

          const elements = Array.from(root.querySelectorAll("input, select, textarea"));
          return elements.map((el) => {
            const tag = el.tagName.toLowerCase();
            const type = tag === "input" ? el.getAttribute("type") || "text" : tag;
            return {
              selector: cssSelectorFor(el),
              tagName: tag,
              type,
              name: el.getAttribute("name") ?? "",
              label: labelFor(el),
              value: (el as HTMLInputElement).value ?? "",
              required: el.hasAttribute("required"),
            };
          });
        }, withinSelector);
        return toolJson({ fields });
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "fill_field",
    {
      description:
        "Fills one form field using the library's field-filling engine (all 10 field types). For checkbox: true/false/yes/no/1/0/on/off/checked/unchecked. For date: YYYY-MM-DD. For file: a filesystem path.",
      inputSchema: {
        sessionId: z.string(),
        selector: z.string(),
        type: z.enum(FIELD_TYPES),
        value: z.string(),
      },
    },
    async ({ sessionId, selector, type, value }) => {
      try {
        const page = getSession(sessions, sessionId).page;
        await fillField(page, { name: selector, selector, type, validValue: value }, value);
        return toolText(`Filled "${selector}" (${type}) with "${value}"`);
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "click",
    {
      description: "Clicks an element — a submit button, a wizard 'Next' control, anything.",
      inputSchema: { sessionId: z.string(), selector: z.string() },
    },
    async ({ sessionId, selector }) => {
      try {
        const page = getSession(sessions, sessionId).page;
        await page.locator(selector).click();
        return toolText(`Clicked "${selector}"`);
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "inspect_element",
    {
      description: "Reads a selector's current state: whether it matched anything, whether it's visible, and its text content.",
      inputSchema: { sessionId: z.string(), selector: z.string() },
    },
    async ({ sessionId, selector }) => {
      try {
        const page = getSession(sessions, sessionId).page;
        const state = await inspectElement(page, selector);
        return toolJson(state);
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "wait_for",
    {
      description:
        "Waits for one condition: a selector to reach a state (visible/attached/hidden/detached), a field's value to equal/be non-empty, or a fixed delay. Fails with a clear error (not a hang) if the condition is never met within timeoutMs.",
      inputSchema: {
        sessionId: z.string(),
        condition: waitConditionSchema,
        timeoutMs: z.number().optional().describe("Default 10000"),
      },
    },
    async ({ sessionId, condition, timeoutMs }) => {
      try {
        const page = getSession(sessions, sessionId).page;
        await performWaits(page, [condition as WaitCondition], timeoutMs ?? 10_000);
        return toolText(`Wait condition met: ${JSON.stringify(condition)}`);
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "get_page_text",
    {
      description: "Returns the page's visible text (body innerText), truncated to 5000 characters.",
      inputSchema: { sessionId: z.string() },
    },
    async ({ sessionId }) => {
      try {
        const page = getSession(sessions, sessionId).page;
        const text = await page.locator("body").innerText();
        const truncated = text.length > 5000;
        return toolText(truncated ? `${text.slice(0, 5000)}\n...[truncated, ${text.length} chars total]` : text);
      } catch (err) {
        return toolError(err);
      }
    }
  );
}
