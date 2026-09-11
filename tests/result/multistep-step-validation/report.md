# runMultiStepStepValidation — test report

**Feature:** loop increment 15 — per-step validation blocking (FR13, test cases MS-04/MS-05)
**Date:** 2026-09-11

## What was implemented
- Extracted `advanceThroughSteps(page, config, uptoStepIndex, timeoutMs)` from `runMultiStepHappyPath`'s inline logic: opens the dialog (if configured) and completes steps `[0, uptoStepIndex)` with valid data, leaving the wizard on step `uptoStepIndex`. `runMultiStepHappyPath` now calls this for steps 0..n-2, then handles the last step itself — behaviorally identical to before, just de-duplicated.
- `runMultiStepStepValidation(config, options)`: for each step, for each field's `invalidValues` entries, opens a **fresh** page/session, calls `advanceThroughSteps` to reach that step, fills the target field with the invalid value (siblings valid), clicks the step's `nextSelector`, and asserts both that the configured error appears *and* that the wizard didn't advance (its own marker still visible, and — if not the last step — the next step's marker never appeared). Returns `ValidationCaseResult[]`, `fieldName` qualified as `"stepName.fieldName"` since names are only unique within a step. A field with no `invalidValues` contributes a single `"skipped"` entry, matching the single-step runners' convention.

## Verification
All live, against both increment-13 fixtures, using the real library function.

### hidden-dom-wizard (all 3 steps)
| Case | Result |
|---|---|
| Step 1 `email` = `""` | PASS |
| Step 2 `displayName` = `""` (only reachable after advancing through step 1) | PASS |
| Step 3 `agree` = `""` (last step, only reachable after advancing through steps 1-2) | PASS |

### dynamic-load-wizard (both steps, including the post-fetch one)
| Case | Result |
|---|---|
| Step 1 `username` = `""` | PASS |
| Step 2 `confirmationCode` = `""` (step 2 only exists in the DOM after the real fetch completes — `advanceThroughSteps` correctly waits for it before this case even attempts to interact with the field) | PASS |
| Step 2 `confirmationCode` = `"abc"` | PASS |

### Regression
`runMultiStepHappyPath` re-run against both fixtures after the `advanceThroughSteps` extraction — both still `"passed"`, confirming the refactor didn't change behavior.

### Negative controls (proving the assertion logic isn't vacuously true)
| Case | Expected | Result |
|---|---|---|
| `expectedError` pointed at a nonexistent selector | `"failed"`, message says the error did not appear | PASS |
| An `invalidValues` entry whose `value` is actually a *valid* email (site accepts it silently, no error, wizard advances) | `"failed"` — never a false "passed" | PASS — confirms the core invariant: a validation case that's silently accepted by the target form is correctly reported as a failure of the test case, not mistaken for success |

## Notes
None.
