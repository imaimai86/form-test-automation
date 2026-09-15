# inspectElement / inspectElements — test report

**Feature:** public element-inspection API (`src/inspect.ts`), added on request to support verification steps that need to check an arbitrary element's state (not just the one being filled or the declared success criterion)
**Date:** 2026-09-15

## What was implemented
- `src/inspect.ts`: `inspectElement(page, selector): Promise<ElementState>` — `{matched, visible, text}`, never throws for a selector that matches nothing (an absent element is a valid state, not an error). `inspectElements(page, selectors): Promise<Record<string, ElementState>>` — batch form.
- `src/runner.ts`: the existing private `captureSnapshot` (used by `submitAndCheckSuccess` for `snapshotSelectors`, FR15) now delegates to `inspectElements` instead of duplicating the same logic. `SnapshotEntry` (the type used on `SubmissionResult.snapshot`) is now a type alias for `ElementState` — same shape, kept as its own exported name since it's already part of the public `SubmissionResult` API.
- Exported `inspectElement`, `inspectElements`, `ElementState` from `src/index.ts`.

## Why
User need, stated directly: a verification step sometimes has to confirm a *different* element than the one being validated got populated correctly (e.g. a preview/summary reflecting a field's value) — not just gate progression (`waits`, already built) or check the declared success message (`success.message`, already built). The `validate(page)` hook (FR16) already made this *possible* by exposing the raw `page`, but callers had to hand-write matched/visible/text logic themselves. This promotes that logic to a public, reusable primitive.

## Verification

### New behavior, standalone
| Case | Expected | Result |
|---|---|---|
| `inspectElement` on a visible, matched element | `{matched: true, visible: true, text: "..."}` | PASS |
| `inspectElement` on a matched but CSS-hidden element | `{matched: true, visible: false, text: "..."}` | PASS |
| `inspectElement` on a selector matching nothing | `{matched: false, visible: false, text: ""}` | PASS |
| `inspectElements` (batch) over all three at once | Same three results, keyed by selector | PASS |
| `inspectElement` used inside a `validate` hook passed to `runMultiStepHappyPath`, checking an element unrelated to the declared `success.message` (confirms `#step-account` is hidden again post-completion) | Custom check appears in `SubmissionResult.checks` as `criterion: "custom"`, `passed: true`, alongside the unrelated `message` check | PASS — demonstrates the exact requested use case: verifying a different element than the one the declarative success criteria already look at |

### Regression (this change refactored the internals of an already-shipped feature — snapshot capture — so it needed explicit re-verification, not just "the build passed")
| Case | Expected | Result |
|---|---|---|
| Single-step `runHappyPathSubmission` with `snapshotSelectors` | Snapshot still captured correctly via the refactored `captureSnapshot` | PASS |
| Multi-step `runMultiStepHappyPath` with `snapshotSelectors` | Same | PASS |
| `runMultiStepHappyPath` against `dynamic-load-wizard` (full happy path) | Still `"passed"` | PASS |
| `runMultiStepStepValidation` against `hidden-dom-wizard` (all 3 steps) | Still all `"passed"` | PASS |
| `runMultiStepStepValidation` against `dynamic-load-wizard` (both steps) | Still all `"passed"` | PASS |
| Full CLI run against the real hosted login form (`examples/login-form.config.json`) | Unchanged: 6 passed, 0 failed, 2 skipped, exit 0 | PASS |

No existing test broke. `npm run build` clean throughout.

## Notes
None.
