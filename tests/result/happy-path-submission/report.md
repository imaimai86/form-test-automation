# happy-path submission runner — test report

**Feature:** loop increment 7 — happy-path submission runner (`src/runner.ts`, `runHappyPathSubmission`)
**Date:** 2026-09-11

## What was implemented
`runHappyPathSubmission(config, options)`: fills every field with its valid value (reusing the shared `fillFormFields` helper), submits, and checks every success criterion present on `config.success` — any combination of `message` (selector + optional text), `redirectUrl`, and `response` (urlPattern + status). All configured criteria must pass for the overall `status` to be `"passed"`.

Returns a single `SubmissionResult { status, checks: SuccessCheckResult[], message }` — one `SuccessCheckResult` per configured criterion, each with its own `passed`/`message`, so a caller can see exactly which criterion failed rather than just a boolean. `response` uses `page.waitForResponse` armed *before* the submit click (with a no-op `.catch` attached immediately to avoid an unhandled-rejection warning if it times out before being awaited later). Never throws for an expected outcome — a criterion not being met is a failed check in the result, not an exception; only genuine infrastructure failures (e.g. navigation errors) are caught and turned into an overall `status: "failed"` with an explanatory message.

## Verification
All live against `https://the-internet.herokuapp.com/login` (`examples/login-form.config.json` and small variants of it).

| Case | Expected | Result |
|---|---|---|
| Valid login (username+password), config has `message` + `redirectUrl` | status "passed", both checks pass | PASS |
| Same, with a `response` criterion added (`urlPattern: "secure"`, `status: 200`) | status "passed", all 3 checks pass, response check reports the real matched URL/status | PASS |
| Deliberately wrong `redirectUrl` (real page still succeeds and lands on `/secure`) | status "failed", `message` check PASS, `redirectUrl` check FAIL with the actual current URL in the message | PASS |

## Notes
None.
