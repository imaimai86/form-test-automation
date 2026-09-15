# get_fill_plan (fill plans for other browser surfaces) — test report

**Feature:** MCP tool `get_fill_plan` (FR22) — config-in, data-out fill plan for an agent to dispatch through a different browser-controlling tool (e.g. `claude-in-chrome`'s `read_page`/`form_input`) instead of this library's own Playwright session
**Date:** 2026-09-16

## Why this shape, not a "CIC mode"
Evaluated first, without building: MCP has no server-to-server tool invocation — this server cannot itself call `claude-in-chrome`'s `form_input`, only the agent can, since that tool belongs to a separate MCP connection scoped to the client, not to this server. So the only correct design is agent-orchestrated: this tool supplies resolved data, the agent dispatches it through whichever tool actually controls the target tab. It is explicitly not a replacement for `run_form_test`/`run_multistep_form_test` — those require a live Playwright `Page` this tool never opens, so none of the validation/happy-path runners apply here.

## What was implemented
- **`src/mcp/shared.ts`** (new): extracted `configInputSchema`, `toolError`, `toolJson`, `loadConfigData` out of `batch-tools.ts` so `fill-plan.ts` reuses them instead of duplicating; `batch-tools.ts` updated to import from here.
- **`src/field-handlers/checkbox.ts`**: exported `parseCheckboxValue` (was private) so the fill-plan tool resolves checkbox truthy/falsy values with the *exact* logic `fillCheckboxField` uses — can't drift out of sync.
- **`src/mcp/fill-plan.ts`** (new), `registerFillPlanTool`: `get_fill_plan(config)` — auto-detects single-step vs multi-step (same `isMultiStepConfigData` used everywhere else), returns:
  - single-step: `{shape, name, url, fields: [{selector, type, value, note?}], submitSelector, success}`
  - multi-step: `{shape, name, url, openTrigger?, dialogSelector?, steps: [{name, stepMarkerSelector, fields, nextSelector}], success}`
  - Value resolution per type: `checkbox` → real boolean via `parseCheckboxValue` (falls back to the original string + the parser's own error message as `note` if unrecognized, rather than throwing); `radio` → `true` with a note explaining the selector-targets-one-option semantics; `file` → the configured path passed through with a note that it can't be filled via a value at all; `select` → the configured value passed through with a note about value/label matching; everything else → passthrough.

## Verification
All via the MCP SDK `Client` against the real built server.

| Case | Expected | Result |
|---|---|---|
| `tools/list` includes `get_fill_plan` | Listed with its description | PASS |
| Single-step config (`examples/login-form.config.json`) | `shape: "single-step"`, 2 fields, correct selectors/types/values | PASS |
| Multi-step config (`fixtures/multi-step/hidden-dom-wizard/config.json`) | `shape: "multi-step"`, correct step structure | PASS |
| Checkbox (`validValue: "true"`) inside the multi-step plan | `value: true` (a real boolean, not the string) | PASS |
| Radio field (synthetic config) | `value: true`, note explains "always check this option" | PASS |
| Select field (synthetic config) | Value passed through, note explains value/label matching | PASS |
| File field (synthetic config) | Value passed through, note explicitly says this can't be filled via a value / needs a file picker | PASS |
| Unrecognized checkbox value (`"maybe-not-valid"`) | Passed through as-is, `note` contains the parser's own error text — not thrown | PASS |
| No browser/fixture server running at all | `get_fill_plan` still succeeds — confirms it's genuinely browser-free (pure config parsing) | PASS |
| Regression: `validate_form_config` and `run_form_test` (browser-dependent) after the `shared.ts` extraction | Both unchanged — `run_form_test` on the real login form still returns 6 passed/0 failed/2 skipped | PASS |
| `npm run typecheck`, CLI run against `examples/login-form.config.json` | Clean, unchanged | PASS |

## Notes
None.
