# format/pattern validation runner — test report

**Feature:** loop increment 6 — format/pattern validation test runner (`src/runner.ts`, `runFieldFormatValidation`)
**Date:** 2026-09-11

## What was implemented
- Generalized `fillFormFieldsSkipping` into `fillFormFields(page, config, overrides, skip, timeoutMs)`, shared by both `runRequiredFieldValidation` (skip the target field) and the new `runFieldFormatValidation` (override the target field with a specific invalid value). No duplicated fill logic between the two runners.
- `runFieldFormatValidation(config, options)`: for each field's `invalidValues` entries with a non-empty `value` (format/length/pattern cases), fills that field with the invalid value (every other field valid), submits, and asserts the case's `expectedError` appears. Same `ValidationCaseResult[]` shape as increment 5 (`passed`/`failed`/`skipped`). A field with no non-empty `invalidValues` entries is reported `skipped`.

## Verification

### Real hosted form (committed fixture)
`examples/login-form.config.json` against `https://the-internet.herokuapp.com/login`:

| Case | Expected | Result |
|---|---|---|
| `username`: no non-empty invalidValues | status "skipped" | PASS |
| `password` = "wrong-password" | status "passed", error at `#flash` | PASS |

### Local fixture with real client-side pattern validation
Investigated `https://demoqa.com/automation-practice-form` first as a richer format-validation demo, but its email/phone `is-invalid` class didn't reliably trigger via a straightforward submit (likely requires its other JS-managed required fields — gender, DOB widget — filled first); not worth the added fragility for this increment, so not used.

Instead, built a small local static fixture (`<input id="promo">` with a real `^[A-Z]{4}-\d{4}$` regex check in a submit handler that shows/hides `#promo-error`) and ran `runFieldFormatValidation` against it directly:

| Case | Expected | Result |
|---|---|---|
| `promo` = "not-a-promo-code" | status "passed", error at `#promo-error` appears | PASS |

Both scenarios ran through the real `fillField` → navigate → submit → `waitFor` pipeline against a live page (one remote, one local), not mocked.

## Notes
The tool's own job here is purely mechanical — fill the invalid value, submit, wait for the page's own declared error to appear. It doesn't implement regex/format checking itself (that's the target form's responsibility); FR4 only requires the configured error to be asserted. Both the "generic server-rejected" case (login form) and the "real client-side regex" case (local fixture) exercise the identical runner code path successfully.
