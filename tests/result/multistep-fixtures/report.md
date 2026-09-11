# multi-step wizard fixtures — test report

**Feature:** loop increment 13 — two local fixtures proving the "one mechanism, two delivery styles" design claim (FR12)
**Date:** 2026-09-11

## What was implemented
Two committed fixtures under `fixtures/multi-step/`, each with an `index.html` and a matching `config.json` (a `MultiStepFormConfig`, reused as-is by increments 14-16):

- **`hidden-dom-wizard/`**: 3-step signup wizard (email → display name → agree-to-terms checkbox) inside a dialog opened by `#open-dialog`. All three steps' markup exists in the initial HTML; each is hidden via inline `style="display:none;"` and revealed by inline JS only after the current step's field passes a simple client-side check.
- **`dynamic-load-wizard/`**: 2-step wizard (username → confirmation code) inside a dialog. Step 2's markup (`#step-confirm`) does not exist in the DOM at all until step 1's field validates and a real `fetch('step2-fragment.html')` call resolves and its response is inserted via `innerHTML` — a genuine network round-trip against a second static file, not a CSS toggle.

Both fixtures serve on fixed local ports (8940, 8941) referenced directly in their committed configs, matching the convention `examples/login-form.config.json` set for a real hosted form (this one just points at a fixture instead).

## Verification
This increment verifies the *fixtures*, not the runner (increment 14 verifies the runner against these). All checks driven by hand-written raw Playwright calls, not the library.

### hidden-dom-wizard
| Case | Expected | Result |
|---|---|---|
| Dialog hidden before trigger, visible after | `#dialog` not visible → visible after clicking `#open-dialog` | PASS |
| Happy path through all 3 steps | Each step's marker becomes visible in turn; `#signup-success` reached with "Welcome" text | PASS |
| Required field left empty (step 1 email) | `#email-error` appears; still on `#step-account`; `#step-profile` never appears | PASS |

### dynamic-load-wizard
| Case | Expected | Result |
|---|---|---|
| `#step-confirm` does not exist in DOM before step 1's Next is clicked | `locator('#step-confirm').count() === 0` | PASS — confirmed count is exactly 0 before, 1 after |
| Happy path through both steps | Step 2 appears only after the fetch resolves; `#final-success` reached with "Verified" text | PASS |
| Required field left empty (step 1 username) | `#username-error` appears; `#step-confirm` still not in the DOM at all (not just hidden) | PASS |
| Invalid confirmation code on step 2 | `#code-error` appears; still on `#step-confirm` | PASS |

### Key claim confirmed
The identical `locator(selector).waitFor({ state: "visible" })` pattern correctly handled both delivery styles — a pre-existing hidden node becoming visible, and a node that didn't exist in the DOM at all until inserted by a real fetch response. No fixture-specific wait logic was needed on the Playwright-calling side; the only difference between the two verification scripts is *what* they wait for, never *how*.

## Notes
None.
