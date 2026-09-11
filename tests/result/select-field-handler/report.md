# select field handler — test report

**Feature:** select field handler (`fillSelectField` in `src/field-handlers/select.ts`)
**Date:** 2026-09-11

## What was implemented
`fillSelectField` waits for the `<select>` element (via `field.selector`) to become visible within `timeoutMs`, then chooses an option by matching `value` against the option's `value` attribute first, falling back to matching against the option's visible label text if no such `value` exists.

## Verification
Fixture: http://127.0.0.1:8934/index.html (`#country` select)

| Case | Expected | Result |
|---|---|---|
| Select by option value "us" | inputValue() === "us" | PASS |
| Select by option label "United States" | inputValue() === "us" | PASS |

## Notes
Verification was run via a temporary Node script (`chromium.launch()` headless, navigating to the live fixture server, importing the compiled `dist/field-handlers/select.js`) executed from the worktree so it could resolve the symlinked `node_modules`. The script was deleted after the run; only `src/field-handlers/select.ts` and this report are new/changed files.
