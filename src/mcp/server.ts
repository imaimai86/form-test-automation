import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { BrowserSession } from "../browser";
import { registerSessionTools } from "./tools";

// Not imported from "../index" to avoid a circular import (index.ts exports
// startMcpServer from this file). Keep in sync with index.ts's VERSION.
const MCP_SERVER_VERSION = "0.1.0";

const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60 * 1000;

export interface SessionEntry {
  session: BrowserSession;
  lastUsed: number;
}

export interface StartMcpServerOptions {
  /** Milliseconds a session may sit unused before it's closed automatically. Default 10 minutes. */
  idleTimeoutMs?: number;
}

/**
 * Builds the MCP server (tool registrations happen in later increments) and
 * an in-memory session store shared by all tool handlers, keyed by a
 * generated session ID. A session unused for `idleTimeoutMs` is closed
 * automatically so a crashed/forgetful MCP client doesn't leak Chromium
 * processes indefinitely — explicit `close_session` remains the normal path.
 */
export function createMcpServer(options: StartMcpServerOptions = {}): {
  server: McpServer;
  sessions: Map<string, SessionEntry>;
  stopIdleCleanup: () => void;
} {
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const sessions = new Map<string, SessionEntry>();

  const cleanupTimer = setInterval(
    () => {
      const now = Date.now();
      for (const [id, entry] of sessions) {
        if (now - entry.lastUsed > idleTimeoutMs) {
          entry.session.browser.close().catch(() => {});
          sessions.delete(id);
        }
      }
    },
    Math.max(1000, Math.min(idleTimeoutMs, 60_000))
  );
  cleanupTimer.unref();

  const server = new McpServer({ name: "form-test-automation", version: MCP_SERVER_VERSION });

  server.registerTool(
    "ping",
    { description: "Health check — returns pong. Confirms the MCP server is reachable." },
    async () => ({ content: [{ type: "text" as const, text: "pong" }] })
  );

  registerSessionTools(server, sessions);

  return { server, sessions, stopIdleCleanup: () => clearInterval(cleanupTimer) };
}

/** Starts the MCP server on stdio and connects it. Resolves once connected (the process then stays alive listening on stdio). */
export async function startMcpServer(options: StartMcpServerOptions = {}): Promise<void> {
  const { server } = createMcpServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
