# CLI wired to runners — test report

**Feature:** loop increment 8 — CLI binary wired to the library's runners (`src/cli.ts`)
**Date:** 2026-09-11

## What was implemented
`src/cli.ts` now actually runs the test suite instead of printing a placeholder:
- Accepts a single config file path or a directory of config files (`loadFormConfigs`, already built in increment 2).
- For each config, runs `runRequiredFieldValidation`, `runFieldFormatValidation`, and `runHappyPathSubmission` in sequence, printing a `[PASS]`/`[FAIL]`/`[SKIP]` line per case plus a per-form summary (passed/failed/skipped counts).
- Exits non-zero if any case across any form failed (`skipped` does not count as a failure).
- `main()` is now async (the runners are async); the top-level safety net changed from a synchronous try/catch to `main().catch(...)` so an unexpected rejection still prints a clean one-line message instead of a stack trace, exactly like the previous synchronous version did for thrown errors.

## Verification
All against real builds (`npm run build`) and, where noted, the real hosted login form.

| Case | Command | Expected | Result |
|---|---|---|---|
| Single config, real form | `node dist/cli.js examples/login-form.config.json` | Full Playwright run against the live form, exit 0 | PASS — 4 passed, 0 failed, 1 skipped, exit 0 |
| Deliberately-failing config | `node dist/cli.js <failing config>` (bad expectedError selector + missing password field) | Non-zero exit, clear FAIL lines, no stack trace | PASS — 2 failed cases reported with specific messages, exit 1 |
| Directory of 2 configs | `node dist/cli.js <dir with a.json, b.json>` | Both forms tested and reported, exit reflects the failing one | PASS — "2 form(s) tested, 2 failing case(s) total.", exit 1 |
| Nonexistent config path | `node dist/cli.js <bad path>` | Clean `ConfigError` message, no stack trace, exit 1 | PASS |

## Notes
None.
