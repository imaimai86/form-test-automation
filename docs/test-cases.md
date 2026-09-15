# Test Cases — Hosted Form Testing Tool

Each test case has: **ID**, description, preconditions, steps, expected result,
priority (P0 = must-have for v1, P1 = important, P2 = nice-to-have), and the
functional requirement (FR#) it maps to from `docs/requirements.md`.

---

## 1. Field Validation

| ID | Description | Preconditions | Steps | Expected Result | Priority | FR |
|----|---|---|---|---|---|---|
| FV-01 | Required field left empty | Form config marks field `required` | Leave field empty, submit | Configured validation error shown for that field | P0 | FR4 |
| FV-02 | Invalid email format | Field type `email` | Enter `not-an-email`, submit | Email format error shown | P0 | FR4 |
| FV-03 | Invalid phone format | Field type `phone` | Enter `abc`, submit | Phone format error shown | P0 | FR4 |
| FV-04 | Below min length | Field has `minLength` rule | Enter value shorter than min | Length error shown | P0 | FR4 |
| FV-05 | Above max length | Field has `maxLength` rule | Enter value longer than max | Length error shown | P0 | FR4 |
| FV-06 | Pattern mismatch | Field has `pattern` rule | Enter value not matching pattern | Pattern error shown | P1 | FR4 |
| FV-07 | Required select left unselected | Field type `select`, `required` | Leave on placeholder option, submit | Selection-required error shown | P0 | FR4 |
| FV-08 | Required radio group unselected | Field type `radio`, `required` | Submit without selecting any option | Required error shown | P0 | FR4 |
| FV-09 | Required checkbox unchecked | Field type `checkbox`, `required` | Submit without checking | Required error shown | P0 | FR4 |
| FV-10 | Invalid date | Field type `date` | Enter an out-of-range or malformed date | Date error shown | P1 | FR4 |

## 2. Submission Flow

| ID | Description | Preconditions | Steps | Expected Result | Priority | FR |
|----|---|---|---|---|---|---|
| SF-01 | Happy-path submission | All fields have valid values configured | Fill all fields with valid values, submit | Configured success criteria met (message/redirect/response) | P0 | FR5 |
| SF-02 | Success verified via network response | `success` config includes a response matcher | Submit valid data | Matching network response observed (status/payload) | P1 | FR5 |
| SF-03 | Post-submit page state | Success config includes redirect URL | Submit valid data | Browser URL matches configured redirect | P1 | FR5 |

## 3. Error Handling

| ID | Description | Preconditions | Steps | Expected Result | Priority | FR |
|----|---|---|---|---|---|---|
| EH-01 | All required fields empty | Form has ≥2 required fields | Submit with everything empty | All configured required-field errors shown together | P0 | FR4 |
| EH-02 | Partial required fields filled | Form has ≥2 required fields | Fill some required fields, leave others empty, submit | Only the empty required fields show errors | P0 | FR4 |
| EH-03 | Multiple simultaneous validation errors | Form has fields with different rule types | Fill multiple fields with invalid values, submit | Each field's specific error is shown independently | P1 | FR4 |

## 4. Config-Driven Coverage

| ID | Description | Preconditions | Steps | Expected Result | Priority | FR |
|----|---|---|---|---|---|---|
| CFG-01 | Valid config loads | Well-formed config file | Load config | Tool parses it without error and produces the expected test set | P0 | FR1, FR9 |
| CFG-02 | Malformed config rejected | Config missing a required key (e.g. `url`) | Load config | Loader throws a specific, actionable error naming the missing key | P0 | FR9 |
| CFG-03 | Unknown field type rejected | Config field has an unsupported `type` | Load config | Loader throws an error naming the field and the invalid type | P1 | FR9 |
| CFG-04 | Directory of configs | Directory contains multiple valid config files | Run CLI against the directory | Every config is loaded and run; results reported per form | P0 | FR7 |

## 5. Packaging (CLI & Library)

| ID | Description | Preconditions | Steps | Expected Result | Priority | FR |
|----|---|---|---|---|---|---|
| PKG-01 | CLI run via npx against a single config | Package built/linked locally | `npx <package-name> path/to/config.json` | Runs the test suite for that config, exits 0 on all pass | P0 | FR7 |
| PKG-02 | CLI run against a directory | Package built/linked locally | `npx <package-name> path/to/configs/` | Runs every config in the directory, exits 0 only if all pass | P0 | FR7 |
| PKG-03 | CLI exits non-zero on failure | A config with a deliberately wrong selector/expectation | Run CLI against it | Process exit code is non-zero; report shows the failing case | P0 | FR7, FR8 |
| PKG-04 | Library import in a consuming project | Package installed as a dependency | `import { runFormTests } from '<package-name>'`, call it with a config path | Returns/resolves a structured result object usable in the consumer's own code | P0 | FR7 |
| PKG-05 | Library usage inside another test suite | Package installed as a dev dependency | Call the library function from within a Jest/Vitest/Playwright test | Test suite can assert on the returned results directly | P1 | FR7 |

---

## 6. Edge Cases

Same ID/preconditions/steps/expected/priority/FR structure as above; grouped
by input category. Priorities skew P1/P2 except where a case represents a
real security or data-integrity risk (marked P0).

### Text fields

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-TXT-01 | Whitespace-only value in a required field | Treated as empty; required error shown | P1 | FR4 |
| EC-TXT-02 | Leading/trailing whitespace | Trimmed (or rejected, per config) before validation/submission | P1 | FR3 |
| EC-TXT-03 | Unicode/emoji/CJK/accented characters (José, 田中, 🎉) | Accepted where free text is allowed | P1 | FR3 |
| EC-TXT-04 | Apostrophes/hyphens in names (O'Brien, Smith-Jones) | Accepted, not misflagged as invalid | P1 | FR4 |
| EC-TXT-05 | Max-length boundary: exactly at limit / one over / far over (10k+ chars) | At-limit accepted; over-limit rejected with length error | P1 | FR4 |
| EC-TXT-06 | Zero-width/invisible Unicode pasted in | Handled without breaking validation (either stripped or counted) | P2 | FR3 |
| EC-TXT-07 | HTML/script injection payload (`<script>alert(1)</script>`) | Escaped/sanitized on render, never executed | P0 | FR3, FR5 |
| EC-TXT-08 | SQL-injection-style string (`' OR '1'='1`) | Handled safely, no server error/bypass | P0 | FR5 |

### Email fields

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-EML-01 | Plus-addressing (`user+tag@domain.com`) | Accepted as valid | P1 | FR4 |
| EC-EML-02 | Multi-level subdomain (`a@mail.sub.domain.co.uk`) | Accepted as valid | P2 | FR4 |
| EC-EML-03 | Consecutive/leading/trailing dots (`a..b@domain.com`) | Rejected with format error | P1 | FR4 |
| EC-EML-04 | Missing TLD (`user@domain`) | Rejected with format error | P1 | FR4 |
| EC-EML-05 | Internationalized domain (IDN/punycode) | Accepted as valid | P2 | FR4 |
| EC-EML-06 | Mixed-case address | Accepted, normalized | P2 | FR4 |
| EC-EML-07 | Extremely long local-part/domain (RFC boundary) | Handled per configured max length, not a crash | P2 | FR4 |

### Phone fields

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-PHN-01 | International format (`+`, spaces, dashes, parens) | Accepted as valid | P1 | FR4 |
| EC-PHN-02 | Too few / too many digits | Rejected with format error | P1 | FR4 |
| EC-PHN-03 | Non-numeric characters mixed in | Rejected with format error | P1 | FR4 |
| EC-PHN-04 | Extension suffix (`x1234`) | Accepted if configured as valid, rejected otherwise | P2 | FR4 |

### Password fields

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-PWD-01 | Exactly meets complexity minimum | Accepted | P1 | FR4 |
| EC-PWD-02 | One character short of minimum | Rejected with complexity error | P1 | FR4 |
| EC-PWD-03 | Confirm-password mismatch (case-sensitive) | Mismatch error shown | P0 | FR4 |
| EC-PWD-04 | Whitespace preserved, not trimmed | Leading/trailing spaces treated as significant | P2 | FR3 |
| EC-PWD-05 | Unicode/emoji allowed | Accepted where configured as valid | P2 | FR4 |

### Number / currency fields

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-NUM-01 | Negative number where only positive allowed | Rejected with range error | P1 | FR4 |
| EC-NUM-02 | Decimal where integer expected (or vice versa) | Rejected with format error | P1 | FR4 |
| EC-NUM-03 | Scientific notation (`1e10`) | Rejected or normalized per config, not silently mis-parsed | P2 | FR4 |
| EC-NUM-04 | Leading zeros (`007`) | Handled per config (accepted/normalized) | P2 | FR4 |
| EC-NUM-05 | Locale-variant separators (`1,234.56` vs `1.234,56`) | Handled per configured locale, not misread | P2 | FR4 |
| EC-NUM-06 | Currency symbol typed into field | Rejected with format error, or stripped per config | P2 | FR4 |
| EC-NUM-07 | Value exactly at min/max boundary | Accepted at boundary; rejected just past it | P1 | FR4 |

### Date / time fields

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-DT-01 | Invalid calendar date (Feb 30, Apr 31) | Rejected with date error | P1 | FR4 |
| EC-DT-02 | Leap-year Feb 29 on non-leap year | Rejected; accepted on an actual leap year | P2 | FR4 |
| EC-DT-03 | Ambiguous format (`03/04/2026`) | Interpreted consistently per configured locale | P2 | FR4 |
| EC-DT-04 | Past date where only future allowed (or vice versa) | Rejected with range error | P1 | FR4 |
| EC-DT-05 | Typed date vs. date-picker selection | Both produce the same underlying submitted value | P2 | FR3 |

### Select / radio / checkbox / dropdown

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-SEL-01 | Required select left on placeholder option | Required error shown | P0 | FR4 |
| EC-SEL-02 | "Select all" toggles individual checkboxes and stays in sync | State stays consistent both directions | P2 | FR3 |
| EC-SEL-03 | Dropdown submitted before async options finish loading | Submission blocked or waits, not silently empty | P1 | FR3 |
| EC-SEL-04 | Keyboard-only selection (arrows + space/enter) | Produces same result as a mouse click | P1 | FR3 |

### File upload

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-FIL-01 | Wrong file type/extension | Rejected with clear error | P1 | FR4 |
| EC-FIL-02 | File exceeds max size | Rejected with size error | P1 | FR4 |
| EC-FIL-03 | Empty (0-byte) file | Rejected or handled per config | P2 | FR4 |
| EC-FIL-04 | Filename with spaces/unicode/path-traversal chars (`../../etc.jpg`) | Handled safely, no path traversal | P0 | FR3 |
| EC-FIL-05 | Double-extension filename (`invoice.pdf.exe`) | Rejected by extension/type check | P1 | FR4 |
| EC-FIL-06 | Multiple files where single expected | Rejected or only first file used, per config | P2 | FR3 |

### Conditional / dependent fields

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-CND-01 | Selecting "Other" reveals a newly-required field | New field appears and is enforced as required | P1 | FR4 |
| EC-CND-02 | Hiding a field via prior selection excludes it from submission | Hidden field's value is not submitted | P1 | FR3 |
| EC-CND-03 | Toggling a conditional field back and forth | No stale required-state or stale value left behind | P2 | FR3, FR4 |

### Cross-field validation

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-XF-01 | End date earlier than start date | Cross-field error shown | P1 | FR4 |
| EC-XF-02 | Password/confirm-password mismatch | Mismatch error shown | P0 | FR4 |
| EC-XF-03 | Min-value field greater than max-value field | Cross-field error shown | P1 | FR4 |

### Formatting / input masks

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-FMT-01 | Auto-formatting field (card number, phone mask) typed digit-by-digit | Displayed/submitted value matches expected mask | P2 | FR3 |
| EC-FMT-02 | Pasting a fully-formatted value into a masked field | Accepted equivalently to typed input | P2 | FR3 |

### Async / dynamic validation

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-ASY-01 | Debounced check (e.g. username availability) resolves after field changes again | Stale result is discarded, latest input wins | P1 | FR4 |
| EC-ASY-02 | Loading indicator during async validation | Shown while pending, cleared on both success and failure | P2 | FR4 |
| EC-ASY-03 | Async error blocks submit even if sync validation passed | Submission blocked until async check resolves | P1 | FR4, FR5 |

### Submission / environment edge cases

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-ENV-01 | Double-clicking submit | Only one submission/request is made | P0 | FR5 |
| EC-ENV-02 | Browser back button after submission | Form state/resubmission behavior matches expectation (no silent duplicate) | P1 | FR5 |
| EC-ENV-03 | Network interruption/timeout mid-submission | Tool surfaces a clear error rather than hanging | P1 | FR5 |
| EC-ENV-04 | Client-side validation bypassed, malformed data posted directly | Server-side still rejects invalid data | P0 | FR5 |
| EC-ENV-05 | Browser autofill lands in mismatched field types | Detected/flagged rather than silently accepted | P2 | FR3 |

### Accessibility-adjacent (functional, not a full a11y audit)

| ID | Description | Expected Result | Priority | FR |
|----|---|---|---|---|
| EC-A11Y-01 | Error message associated with its field via `aria-describedby`/`aria-invalid` | Attributes present and correctly linked | P2 | FR4 |
| EC-A11Y-02 | Full keyboard-only traversal (Tab/Shift+Tab/Enter/Space) | Entire form fillable and submittable without a mouse | P1 | FR3, FR5 |
| EC-A11Y-03 | Dynamically inserted error uses `aria-live` | Attribute present on the error container | P2 | FR4 |

---

## 7. Multi-Step Form Test Cases (in a Dialog)

See `docs/requirements.md`, "Multi-Step Forms (in a Dialog)" for the schema
and the key design decision (one step-transition mechanism covers both
delivery styles below — these test cases exist to prove that, not because
the tool has two code paths).

| ID | Description | Preconditions | Steps | Expected Result | Priority | FR |
|----|---|---|---|---|---|---|
| MS-01 | Dialog opens via trigger | Config has `openTrigger` | Navigate, click `openTrigger` | `dialogSelector` (if configured) becomes visible | P0 | FR11 |
| MS-02 | Happy path — steps already in DOM, hidden | Fixture (a): all steps present, hidden via CSS | Fill step 1 valid, click Next; repeat for all steps; submit last step | Each step's marker becomes visible in turn; final `success` criteria met | P0 | FR12, FR14 |
| MS-03 | Happy path — steps loaded dynamically | Fixture (b): step 2 fetched/inserted after step 1's Next | Fill step 1 valid, click Next; step 2 appears; fill valid; submit | Same outcome as MS-02 via the identical runner code path | P0 | FR12, FR14 |
| MS-04 | Per-step required-field validation blocks advancement | Step field marked `required` with an empty-value `invalidValues` case | Leave the field empty, click step's `nextSelector` | Configured error appears; current step's marker still visible; next step's marker never appears | P0 | FR13 |
| MS-05 | Per-step format validation blocks advancement | Step field has a non-empty `invalidValues` case | Fill the invalid value, click step's `nextSelector` | Configured error appears; wizard does not advance | P0 | FR13 |
| MS-06 | Multi-step happy path with a custom `validate` hook | Library caller passes `validate(page)` | Complete the wizard | Hook's result is ANDed with declarative `success` criteria; both must pass for overall "passed" | P1 | FR16 |
| MS-07 | Snapshot captured on final submission | Config has `snapshotSelectors` | Complete the wizard (pass or fail) | Result includes, per selector, whether it matched/was visible/its text — regardless of overall pass/fail | P1 | FR15 |
| MS-08 | Dialog never opens (trigger selector wrong/missing) | Config's `openTrigger` targets a nonexistent element | Attempt to run | Clear, specific error (not a stack trace); no attempt to fill fields inside a dialog that never appeared | P1 | FR11 |
| MS-09 | Step 2 arrives slower than the default timeout (dynamic-load fixture) | Fixture (b) with an artificial delay before inserting step 2 | Click step 1's Next | Waits up to the configured timeout for step 2's marker; times out with a specific message if it never appears (not a hang) | P2 | FR12 |

---

## 8. MCP Interface Test Cases

See `docs/requirements.md`, "MCP Interface (AI-Driven Form Filling and
Verification)" for the tool surface and design.

| ID | Description | Preconditions | Steps | Expected Result | Priority | FR |
|----|---|---|---|---|---|---|
| MCP-01 | Server responds to MCP handshake | Server spawned as a subprocess over stdio | Send `initialize`, then `tools/list` | Valid MCP responses; all documented tools listed with schemas | P0 | FR17 |
| MCP-02 | `open_session` then `close_session` | Server running | Call `open_session(url)`, then `close_session(sessionId)` | Returns a session ID; browser closes cleanly on `close_session` | P0 | FR18 |
| MCP-03 | `discover_fields` finds real form fields | A fixture page with known inputs | Call `discover_fields(sessionId)` | Returns selectors/types/labels matching the fixture's actual fields | P0 | FR18 |
| MCP-04 | `fill_field` + `inspect_element` round-trip | Open session on a fixture | Fill a text field, then inspect a related element (e.g. its container or an echo) | Filled value reflected; inspected element's state matches expectation | P0 | FR18 |
| MCP-05 | `click` advances a multi-step wizard | Open session on a wizard fixture, dialog open, step 1 filled | Call `click(sessionId, nextSelector)` | Next step's marker becomes visible (same mechanism as increment 14) | P0 | FR18 |
| MCP-06 | `wait_for` blocks until a condition is met | Fixture with delayed content (reuse the increment-12 waits fixture pattern) | Call `wait_for` with a `"value"` condition | Resolves only once the value actually matches; times out with a clear error if it never does | P1 | FR18 |
| MCP-07 | Unknown `sessionId` fails gracefully | No session opened, or already closed | Call any session-scoped tool with a bogus ID | MCP tool error result with a specific message, not an uncaught exception/crash | P0 | FR20 |
| MCP-08 | Idle session auto-closed | Session opened, left untouched past the idle timeout (use a short timeout for the test) | Wait past the timeout, then call a tool with that session ID | Tool reports the session as gone/expired, not a hang or crash | P1 | FR18 |
| MCP-09 | `run_form_test` matches CLI output for the same config | A real single-step config (e.g. `examples/login-form.config.json`) | Call `run_form_test(config)` via MCP, and `fill-forms` via CLI, on the same config | Same pass/fail/skip outcome for every case | P0 | FR19 |
| MCP-10 | `run_multistep_form_test` matches CLI output for the same config | A multi-step fixture config | Call `run_multistep_form_test(config)` via MCP, and the CLI, on the same config | Same pass/fail/skip outcome | P0 | FR19 |
| MCP-11 | `validate_form_config` catches a bad config without launching a browser | A deliberately malformed config (inline JSON) | Call `validate_form_config` | Specific `ConfigError`-equivalent message; no navigation/browser launch attempted | P1 | FR19 |

---

## Coverage Notes

- P0 cases are the target for loop increments 5-7 (validation + happy-path
  submission) and the packaging loop (8); P0 edge cases (injection, path
  traversal, double-submit, cross-field password/confirm mismatch, bypassed
  client validation) are pulled into loop 10 rather than deferred further.
- P1/P2 edge cases are fair game to trim or defer per-form if a given hosted
  form doesn't have the relevant field type (e.g. no file upload → skip
  EC-FIL-*).
- No PDF or local-HTML-file test cases are included here — see
  `docs/requirements.md` Future Expansion.
