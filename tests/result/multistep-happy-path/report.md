# runMultiStepHappyPath — test report

**Feature:** loop increment 14 — the actual multi-step happy-path runner (FR12, FR14), plus DOM snapshot (FR15) and custom validate hook (FR16) retrofitted onto both single-step and multi-step submission runners
**Date:** 2026-09-11

## What was implemented
- Extracted `submitAndCheckSuccess(page, success, submitAction, timeoutMs, extra)` out of the existing `runHappyPathSubmission` — arms the network-response listener, performs the caller-supplied submit action, runs message/redirectUrl/response checks, an optional `extra.validate` hook (added as a `"custom"` entry in the `checks` array, ANDed with the rest), and an optional DOM snapshot capture. Shared by both submission runners so success-checking logic lives in exactly one place.
- `SubmissionResult` gained `snapshot?: Record<string, {matched, visible, text}>`. `SuccessCriterionKind` gained `"custom"`.
- `runMultiStepHappyPath(config, options)`: opens the page, performs top-level `waits` if configured, clicks `openTrigger` and waits for `dialogSelector` if configured (a failure here is a specific, caught error — not a hang or crash), then for each step performs that step's `waits`, fills its fields, and clicks `nextSelector` — waiting for the *next* step's `stepMarkerSelector` on every step but the last, where it instead calls `submitAndCheckSuccess`.
- `waits` was also added to `MultiStepFormConfig` itself (top-level) and its config-loader validation, matching the single-step `FormConfig`'s already-existing top-level `waits`.
- Exported `runMultiStepHappyPath`, `SnapshotEntry`, `SubmissionValidator` from `src/index.ts`.

## Verification
All live, using the actual library function (not raw Playwright calls this time — increment 13 already proved the fixtures behave correctly by hand).

| Case | Expected | Result |
|---|---|---|
| Regression: single-step happy path against the real login form | Unchanged behavior | PASS — 6 passed, 0 failed, 2 skipped, exit 0 |
| `runMultiStepHappyPath` against `hidden-dom-wizard` (all 3 steps in DOM, hidden) | status "passed" | PASS |
| `runMultiStepHappyPath` against `dynamic-load-wizard` (step 2 fetched/inserted) | status "passed", via the *identical* runner code | PASS — proves the FR12 design claim through the real runner, not just hand-written Playwright calls |
| `openTrigger` pointing at a nonexistent selector (MS-08) | status "failed", specific message naming the selector, no hang/crash | PASS — `"Could not open the dialog: clicking openTrigger "#this-does-not-exist" failed: ..."` |
| `snapshotSelectors` on a passing run | Snapshot captures matched/visible/text correctly for both a visible and a hidden element | PASS |
| `snapshotSelectors` on a deliberately-failing run (bad success selector) | Snapshot still captured despite overall failure | PASS |
| Custom `validate` hook that fails even though the declarative `message` criterion passes | Overall status "failed"; `checks` shows `message: PASS` and `custom: FAIL` side by side | PASS |

## Notes
None.
