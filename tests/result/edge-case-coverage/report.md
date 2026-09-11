# edge-case coverage pass — test report

**Feature:** loop increment 10 — edge-case coverage (`docs/test-cases.md` Edge Cases checklist)
**Date:** 2026-09-11

## What was implemented
Considered as two categories: gaps needing genuinely new capability, vs. cases already covered by the existing config-driven engine.

**New capability (code changes):**
- `crossFieldValidation` added to the `FormConfig` schema (`src/types.ts`) and its config-loader validation (`src/config.ts`): a list of named scenarios, each an `overrides` map (field name -> value) plus an `expectedError`. Loader rejects an override referencing an unknown field name.
- `runCrossFieldValidation` (`src/runner.ts`): for each scenario, fills the form with the override values (reusing the existing `fillFormFields` override mechanism — no new fill logic needed), submits, asserts the error appears. No scenarios configured -> single "skipped" result, consistent with the other runners.
- `runDoubleSubmitCheck`: clicks submit, then immediately clicks it again (best-effort — a detached/stale element on the second click is itself evidence the page already navigated away), and asserts the form still reaches its normal single success state.
- `runBackButtonCheck`: submits successfully, then calls `page.goBack()`, and asserts the URL moves away from the post-submit URL without error.
- Both wired into `src/cli.ts` (console output + JSON report) alongside the existing runners.

**Already covered generically (no new code — verified, not built):**
- Whitespace-only values, boundary/max-length values, and arbitrary format/pattern mismatches were already testable via `runFieldFormatValidation`'s existing `invalidValues` mechanism (increment 6) — a config author just adds the case, no engine change needed.
- Async/debounced validation: `assertErrorAppears`'s `waitFor` already polls up to `timeoutMs` regardless of whether the error is synchronous or arrives after a debounced async check — no special-casing required.
- Script/HTML injection payloads: Playwright's `fill()` sets the DOM value property directly (never parses/executes the string), so this is safe by construction, not something our tool needs to guard against.

## Verification

### New capability, live
| Case | Fixture | Expected | Result |
|---|---|---|---|
| Cross-field: password/confirm mismatch | Local fixture with real JS equality check | status "passed", error at `#confirm-error` | PASS |
| Cross-field: matching passwords still succeed (happy path, not cross-field runner) | Same fixture | `runHappyPathSubmission` status "passed" | PASS |
| No `crossFieldValidation` configured | `examples/login-form.config.json` | Single "skipped" result | PASS |
| Double-submit | `examples/login-form.config.json` (real hosted form) | Still lands on the single expected success state | PASS |
| Back-button | `examples/login-form.config.json` (real hosted form) | URL moves from `/secure` back to `/login` without error | PASS |

### Already-generic cases, demonstrated
| Case | Fixture | Expected | Result |
|---|---|---|---|
| Whitespace-only value (`"   "`) via `invalidValues` | Local fixture with real trim-based validation | status "passed" via existing `runFieldFormatValidation` | PASS |
| Over-max-length value via `invalidValues` | Same fixture | status "passed" via existing `runFieldFormatValidation` | PASS |
| `<script>...</script>` payload filled into a textarea | Same fixture | Value round-trips exactly as literal text; `document.querySelectorAll('script').length` unchanged; no side effect executed | PASS |

## Notes
Not every item in the full `docs/test-cases.md` Edge Cases checklist got an individual demo run in this increment (e.g. locale-specific number formats, IDN emails, drag-and-drop file upload) — most of those are the same "already generic" category (config-author-suppliable `invalidValues` cases) rather than needing new engine code, so they're left as future config examples rather than new capability. The representative sample above covers one case from each genuinely distinct mechanism (per-field format, cross-field, submission/environment).
