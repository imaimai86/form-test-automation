# JSON report output — test report

**Feature:** loop increment 9 — machine-readable JSON report output (`src/cli.ts`, `--json <path>` flag)
**Date:** 2026-09-11

## What was implemented
- CLI flag `--json <path>`, parsed alongside the existing config-path argument (order-independent).
- When set, after running all forms the CLI writes a JSON report to that path shaped as:
  ```
  { generatedAt, forms: [{ name, url, requiredFieldValidation, formatValidation, happyPathSubmission, summary: {passed,failed,skipped} }], summary: {passed,failed,skipped} }
  ```
  reusing the exact `ValidationCaseResult[]`/`SubmissionResult` objects already produced by the runners — full per-case detail (field, value, expected error, actual message), enough to debug a failure without re-running.
- Console output is unchanged and remains the default; the JSON report is additive.
- `--json` with no following path, or a path whose directory doesn't exist, is reported as a clean error (not a stack trace) and exits non-zero.

## Verification
All against the real hosted login form (`examples/login-form.config.json`).

| Case | Command | Expected | Result |
|---|---|---|---|
| `--json <valid path>` | `node dist/cli.js examples/login-form.config.json --json <path>` | File written; JSON structure/values match console output exactly | PASS — `forms[0].summary` = `{passed:4,failed:0,skipped:1}`, matching console; `requiredFieldValidation`/`formatValidation` arrays present with 2 entries each; `happyPathSubmission.status` = `"passed"` |
| `--json` with no path | `node dist/cli.js examples/login-form.config.json --json` | Usage error, exit 1, no run performed | PASS |
| `--json` to a nonexistent directory | `node dist/cli.js examples/login-form.config.json --json /nonexistent-dir-xyz/report.json` | Test run still happens and prints; write failure reported cleanly (`ENOENT` message, no stack trace); exit 1 | PASS |

## Notes
None.
