import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isMultiStepConfigData, validateFormConfig, validateMultiStepFormConfig } from "../config";
import { parseCheckboxValue } from "../field-handlers/checkbox";
import { FieldConfig, FormConfig, MultiStepFormConfig, SuccessConfig } from "../types";
import { configInputSchema, toolError, toolJson, loadConfigData } from "./shared";

interface FillPlanField {
  selector: string;
  type: FieldConfig["type"];
  value: string | boolean;
  /** Present when the value needed special handling, or can't be fully resolved by form_input alone (e.g. file uploads). */
  note?: string;
}

interface FillPlanStep {
  name: string;
  stepMarkerSelector: string;
  fields: FillPlanField[];
  nextSelector: string;
}

/**
 * Resolves one field's configured `validValue` into the shape a caller
 * driving the DOM directly (e.g. claude-in-chrome's form_input, which takes
 * string | boolean | number) should dispatch — reusing the exact same
 * true/false parsing fillCheckboxField uses, so this can never drift from
 * how the library's own Playwright-driven fill actually behaves.
 */
function resolveFillValue(field: FieldConfig): { value: string | boolean; note?: string } {
  if (field.type === "checkbox") {
    try {
      return { value: parseCheckboxValue(field.validValue) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { value: field.validValue, note: message };
    }
  }
  if (field.type === "radio") {
    return {
      value: true,
      note: "Radio: this field's selector targets one specific option. Dispatch as checked, regardless of validValue — a radio can't be individually unchecked.",
    };
  }
  if (field.type === "file") {
    return {
      value: field.validValue,
      note: "File input: this is a filesystem path, not a value form_input can set directly — file uploads need a different mechanism (e.g. a native file picker), not this fill plan.",
    };
  }
  if (field.type === "select") {
    return {
      value: field.validValue,
      note: "Select: match this against the target option's value attribute first, falling back to its visible label text if no option has that value.",
    };
  }
  return { value: field.validValue };
}

function planFields(fields: FieldConfig[]): FillPlanField[] {
  return fields.map((field) => {
    const resolved = resolveFillValue(field);
    return { selector: field.selector, type: field.type, value: resolved.value, note: resolved.note };
  });
}

function buildSingleStepPlan(config: FormConfig): Record<string, unknown> {
  return {
    shape: "single-step",
    name: config.name,
    url: config.url,
    fields: planFields(config.fields),
    submitSelector: config.submitSelector,
    success: config.success,
  };
}

function buildMultiStepPlan(config: MultiStepFormConfig): Record<string, unknown> {
  const steps: FillPlanStep[] = config.steps.map((step) => ({
    name: step.name,
    stepMarkerSelector: step.stepMarkerSelector,
    fields: planFields(step.fields),
    nextSelector: step.nextSelector,
  }));
  return {
    shape: "multi-step",
    name: config.name,
    url: config.url,
    openTrigger: config.openTrigger,
    dialogSelector: config.dialogSelector,
    steps,
    success: config.success as SuccessConfig,
  };
}

/**
 * Registers get_fill_plan: a config-in, data-out tool for agent-orchestrated
 * filling through a different browser surface (e.g. claude-in-chrome's
 * read_page/form_input against a real, already-open tab) instead of this
 * library's own Playwright session. Deliberately fill-only — it does not
 * run, and is not a substitute for, the validation/happy-path runners
 * (run_form_test/run_multistep_form_test), which require a live Playwright
 * Page this tool never opens.
 */
export function registerFillPlanTool(server: McpServer): void {
  server.registerTool(
    "get_fill_plan",
    {
      description:
        "Returns a form config's fields as a flat, ready-to-dispatch fill plan (selector, type, resolved value) for an agent to fill through a DIFFERENT tool that controls a real browser tab directly (e.g. claude-in-chrome's read_page + form_input) — not through this library's own Playwright session. Values are resolved the same way fillField would (e.g. checkbox true/false parsed to a real boolean). Fill-only: it does not verify anything, and is not a substitute for run_form_test/run_multistep_form_test, which run the actual validation and happy-path checks via Playwright.",
      inputSchema: { config: configInputSchema },
    },
    async ({ config }) => {
      try {
        const { data, sourceLabel } = loadConfigData(config);
        if (isMultiStepConfigData(data)) {
          const validated = validateMultiStepFormConfig(data, sourceLabel);
          return toolJson(buildMultiStepPlan(validated));
        }
        const validated = validateFormConfig(data, sourceLabel);
        return toolJson(buildSingleStepPlan(validated));
      } catch (err) {
        return toolError(err);
      }
    }
  );
}
