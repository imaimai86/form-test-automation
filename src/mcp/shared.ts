import { z } from "zod";
import { readJsonConfigFile } from "../config";

/** Accepted by every config-driven MCP tool: a file path, or the config as an inline JSON object. */
export const configInputSchema = z
  .union([z.string(), z.record(z.string(), z.unknown())])
  .describe("Either a file path to a config JSON file, or the config as an inline JSON object.");

export function toolError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { isError: true as const, content: [{ type: "text" as const, text: message }] };
}

export function toolJson(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

/** Resolves the `config` tool argument (a file path string, or an inline object) to parsed JSON data plus a label for error messages. */
export function loadConfigData(config: string | Record<string, unknown>): { data: unknown; sourceLabel: string } {
  if (typeof config === "string") {
    return { data: readJsonConfigFile(config), sourceLabel: config };
  }
  return { data: config, sourceLabel: "<inline config>" };
}
