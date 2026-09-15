import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { isMultiStepConfigData, validateFormConfig, validateMultiStepFormConfig } from "../config";
import { computeFormReport, computeMultiStepFormReport } from "../report";
import { configInputSchema, toolError, toolJson, loadConfigData } from "./shared";

/**
 * Registers the config-driven batch tools: thin MCP wrappers around the
 * exact same runners/loaders the CLI uses (via src/report.ts), so results
 * are identical to running the same config through `fill-forms`. No new
 * test logic lives here.
 */
export function registerBatchTools(server: McpServer): void {
  server.registerTool(
    "validate_form_config",
    {
      description:
        "Validates a form config's schema (single-step or multi-step, auto-detected) without launching a browser. Returns the detected shape and a summary, or a specific error if the config is malformed.",
      inputSchema: { config: configInputSchema },
    },
    async ({ config }) => {
      try {
        const { data, sourceLabel } = loadConfigData(config);
        if (isMultiStepConfigData(data)) {
          const validated = validateMultiStepFormConfig(data, sourceLabel);
          return toolJson({ shape: "multi-step", name: validated.name, url: validated.url, stepCount: validated.steps.length });
        }
        const validated = validateFormConfig(data, sourceLabel);
        return toolJson({ shape: "single-step", name: validated.name, url: validated.url, fieldCount: validated.fields.length });
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "run_form_test",
    {
      description:
        "Runs the full single-step form test suite (required-field, format/pattern, cross-field validation, happy-path submission, double-submit and back-button checks) against a config and returns the aggregated results — identical to `fill-forms <config>`.",
      inputSchema: {
        config: configInputSchema,
        headless: z.boolean().optional(),
        timeoutMs: z.number().optional(),
      },
    },
    async ({ config, headless, timeoutMs }) => {
      try {
        const { data, sourceLabel } = loadConfigData(config);
        const validated = validateFormConfig(data, sourceLabel);
        const report = await computeFormReport(validated, { headless, timeoutMs });
        return toolJson(report);
      } catch (err) {
        return toolError(err);
      }
    }
  );

  server.registerTool(
    "run_multistep_form_test",
    {
      description:
        "Runs the full multi-step wizard test suite (per-step validation blocking advancement, happy-path submission through every step) against a config and returns the aggregated results — identical to `fill-forms <multi-step-config>`.",
      inputSchema: {
        config: configInputSchema,
        headless: z.boolean().optional(),
        timeoutMs: z.number().optional(),
      },
    },
    async ({ config, headless, timeoutMs }) => {
      try {
        const { data, sourceLabel } = loadConfigData(config);
        const validated = validateMultiStepFormConfig(data, sourceLabel);
        const report = await computeMultiStepFormReport(validated, { headless, timeoutMs });
        return toolJson(report);
      } catch (err) {
        return toolError(err);
      }
    }
  );
}
