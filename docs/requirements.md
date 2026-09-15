# Requirements — Hosted Form Testing Tool

## Purpose

A Playwright-based tool that automates functional testing of HTML forms: filling
fields with valid and invalid data, asserting validation errors appear where
expected, and confirming successful submission on the happy path. Forms are
described declaratively in config files so that testing a new form doesn't
require writing new code — only a new config.

Published as an npm package, usable both as a standalone CLI (`npx
<package-name> <config-path>`) and as a library imported into other Node/
TypeScript projects.

## Scope

**In scope (v1):** forms hosted at a live URL, reachable directly by Playwright's
browser (`page.goto(url)`).

**Out of scope for v1 — Future Expansion:**
- **Local HTML files** — forms opened via `file://` or a local dev server instead
  of a hosted URL. Expected to reuse most of the same field-filling/validation
  engine once the "form source" is generalized beyond a bare URL.
- **PDF forms** — fillable PDF form fields are not DOM-based, so Playwright's
  page-interaction APIs don't apply directly. Will likely need a separate
  extraction/fill mechanism (e.g. `pdf-lib` or similar) and its own config
  shape and test-case doc. Not designed further here.

## Functional Requirements

- **FR1 — Config-driven form definition.** A form is described by a config file
  containing: target URL, a list of fields (selector, type, validation rules,
  a valid sample value, invalid sample values with expected error text/selector),
  the submit control's selector, and success criteria for a valid submission.
- **FR2 — Navigate & discover.** The tool navigates to the form's URL and locates
  each configured field by its selector, failing with a clear error if a
  selector doesn't resolve.
- **FR3 — Field filling engine.** Given a field's type and a value, the tool
  fills it correctly for that type: text/email/phone/number/textarea via typing,
  select via option selection, checkbox/radio via checking, date via the
  appropriate input method, file via file upload.
- **FR4 — Invalid-input validation runs.** For each field's configured invalid
  value(s), the tool fills that field (others valid), attempts submission, and
  asserts the expected validation error appears (by selector and/or text match).
- **FR5 — Happy-path submission run.** The tool fills all fields with their valid
  values, submits, and asserts the configured success criteria (a success
  message/selector, a URL/redirect change, and/or a matching network response).
- **FR6 — Field type coverage.** Text, email, phone, number, select, checkbox,
  radio, textarea, date, and file upload are all supported field types.
- **FR7 — Dual-purpose npm package.** The tool is published as an npm package
  and works two ways:
  - **As a CLI**, invocable directly via `npx <package-name> <config-path>`
    (a `bin` entry, no local install required) or via a local
    `npm install` + `npx`/npm script, against a single config file or a
    directory of config files.
  - **As a library**, importable in other Node/TypeScript projects
    (`import { runFormTests } from '<package-name>'`) so a consuming project
    can run form tests programmatically (e.g. inside its own test suite) and
    handle results in code, not just via CLI exit codes.
- **FR8 — Result reporting.** Each test case's pass/fail result is recorded and
  summarized per form and across a full run, with enough detail (field, case,
  expected vs. actual) to debug a failure without re-running.
- **FR9 — Config validation.** A malformed or incomplete config file is rejected
  at load time with a specific, actionable error (which field, which key,
  what's wrong) rather than failing deep inside a test run.

## Non-Functional Requirements

- **Headless & headed modes** — both runnable locally and in CI.
- **Deterministic waits** — rely on Playwright's auto-waiting/assertions, not
  fixed `sleep`s, to avoid flaky timing-dependent failures.
- **Config schema validation** — enforced at load time (see FR9), not silently
  ignored.
- **CI-friendly** — non-zero exit code on any failing test case; machine-readable
  report output available (JSON) alongside a human-readable one.
- **Graceful failure, never a crash.** Since this tool exists to test forms,
  the expected failure modes (a selector not found, a config missing a field,
  a network timeout, an unexpected page state) must never surface as an
  uncaught exception/raw stack trace. Every such failure is caught at the
  point it occurs, turned into a specific, human-readable message (what was
  being attempted, what was expected, what actually happened), and recorded
  as a failed test case (or a load-time config error) rather than aborting
  the whole run. The CLI's top-level entry point also catches anything
  unexpected as a last resort and prints a clean message instead of a stack
  trace.
- **Extensible by construction** — the "form source" concept (currently just a
  URL) should be easy to generalize later without reworking the field-filling
  or assertion engine (see Future Expansion above), but no such abstraction is
  built until that work actually starts.
- **Publishable package layout** — `package.json` configured from the start for
  npm publishing: a `bin` entry for the CLI, a `main`/`types` (or `exports`)
  entry for the library import path, a `files` allowlist so only built output
  ships, and a build step (TS → JS) that runs before publish.
- **Written in TypeScript, consumable from both TS and JS.** Source is
  TypeScript; the published package ships compiled JavaScript plus `.d.ts`
  type declarations, so a TypeScript consumer gets full types on
  `import { runFormTests } from '<package-name>'` and a plain JavaScript
  (CommonJS or ESM) consumer can `require`/`import` the same package with no
  build step of their own. No consumer is required to use TypeScript.

## Form Config Schema (v1 shape)

```jsonc
{
  "name": "contact-form",
  "url": "https://example.com/contact",
  "submitSelector": "#submit-button",
  "fields": [
    {
      "name": "email",
      "selector": "#email",
      "type": "email",
      "required": true,
      "validValue": "user@example.com",
      "invalidValues": [
        { "value": "not-an-email", "expectedError": "#email-error" },
        { "value": "", "expectedError": "#email-error" }
      ]
    },
    {
      "name": "country",
      "selector": "#country",
      "type": "select",
      "required": true,
      "validValue": "US",
      "invalidValues": []
    }
  ],
  "success": {
    "message": { "selector": "#success-banner", "text": "Thanks!" },
    "redirectUrl": "https://example.com/thank-you"
  }
}
```

Exact keys may be refined during implementation; this is the shape config
loading/validation (loop 2) is built against.

## Loop-Based Delivery Roadmap

Each numbered item is sized as one `/loop` iteration — a small, independently
testable slice. Order/granularity may be adjusted once implementation starts.

1. Project scaffold: TypeScript + `@playwright/test` install, publishable
   `package.json` (name, `bin` entry, `main`/`types`, `files` allowlist, build
   script), folder structure, config type definitions (types only, no logic).
2. Config loader + schema validation, exported as a library function (FR1, FR9).
3. Navigate to a hosted form URL + field-filling engine for basic input types
   (text/email/number/textarea) (FR2, FR3, FR6 partial).
4. Extend field-filling to select/checkbox/radio/date/file (FR3, FR6 complete).
5. Required-field validation test runner: empty submit → assert errors (FR4).
6. Format/pattern validation test runner: bad email/phone/length → assert
   errors (FR4).
7. Happy-path submission runner: valid data → assert success (FR5).
8. CLI binary (`npx <package-name> <config-path-or-dir>`) wired to the
   library's runner, supporting a single config file or a directory of
   configs (FR7).
9. Reporting output: pass/fail summary, HTML or JSON report (FR8).
10. Edge-case coverage pass — see `docs/test-cases.md` Edge Cases section
    (Unicode/whitespace/injection/boundary values, cross-field validation,
    async/debounced validation, double-submit/back-button handling).
11. Polish: retries for flaky network, README (CLI usage + library import
    usage), npm scripts, basic CI workflow, `npm publish` dry-run check.

## Explicitly Not Part of v1

- No code for local HTML file or PDF form sources.
- No plugin/abstraction system for multiple form sources — that's designed when
  Future Expansion work actually starts.

## Multi-Step Forms (in a Dialog)

Extends the tool to test multi-step ("wizard") forms — often presented inside
a modal/dialog — where each step's submission advances to the next step, and
the final step's submission is the real, terminal success/failure event.

### Key design decision: one mechanism covers both step-delivery styles

Two ways a wizard commonly delivers its next step were called out explicitly:

1. **Already in the DOM, hidden** — all steps exist in the page's HTML from
   load; JS toggles visibility (and runs validation) when "Next" is clicked.
2. **Loaded dynamically** — only the current step exists in the DOM; clicking
   "Next" triggers an AJAX/fetch call whose response is inserted as the next
   step's markup.

**These do not need separate handling.** In both cases, the tool's job is the
same: click the step's "next" control, then wait for the *next* step's marker
selector to reach Playwright's `visible` state. Playwright's locator-based
`waitFor({ state: "visible" })` doesn't care whether the element became
visible via a CSS/display toggle on a pre-existing node or via markup freshly
inserted into the DOM — both look identical from the auto-waiting API's point
of view. So one runner, one wait mechanism, covers both scenarios; the two
example fixtures built for this feature exist to *prove* that claim, not
because the engine needs two code paths.

### Functional Requirements

- **FR10 — Multi-step form config.** A distinct config shape describes an
  ordered list of steps. Each step has: a `stepMarkerSelector` (identifies
  that this step is the currently-active/visible one — used both to confirm
  arrival and, on a failed advance attempt, to confirm we're still there), a
  `fields` list (same `FieldConfig` shape as single-step forms), and a
  `nextSelector` (the control that advances to the next step, or performs the
  real submission on the last step).
- **FR11 — Optional dialog open trigger.** A config may specify an
  `openTrigger` selector, clicked once after navigation to open the
  modal/dialog containing the wizard, and an optional `dialogSelector` waited
  on (visible) to confirm the dialog actually opened before the first step's
  fields are touched. Forms not inside a dialog simply omit these.
- **FR12 — Step-transition detection.** After filling a step's fields and
  clicking its `nextSelector`, the tool waits for the *next* step's
  `stepMarkerSelector` to become visible (see design decision above) — no
  distinct code path for DOM-hidden vs. dynamically-loaded steps.
- **FR13 — Per-step validation.** For a step's required/invalid field values,
  fill that field with the invalid value (siblings valid), click the step's
  `nextSelector`, and assert both: (a) the field's configured error appears,
  and (b) the wizard did *not* advance — the current step's marker is still
  visible (or, equivalently, the next step's marker never appears). Reuses
  the existing `ValidationCaseResult` shape and the existing required/format
  runners' logic, scoped to one step's fields at a time.
- **FR14 — Final-step submission.** Clicking the last step's `nextSelector`
  is treated as the real submission: the existing `success` criteria
  mechanism (message/redirectUrl/response) applies unchanged.

### Post-Submission Verification: Snapshot + Custom Validation

Declarative `success` criteria (message/redirectUrl/response) cover the
common cases, but not everything a real form's post-submit state needs
checking against. Two additions, applying to both the existing single-step
`runHappyPathSubmission` and the new multi-step final-step submission:

- **FR15 — DOM snapshot on submission result.** A config may list
  `snapshotSelectors: string[]`. After the submission attempt (regardless of
  pass/fail), the tool captures, for each selector: whether it matched
  anything, whether it's visible, and its text content — attached to the
  returned result object (not printed as pass/fail lines, just structured
  data) so a caller can inspect the actual resulting page state without
  re-running the browser. Included in the JSON report output.
- **FR16 — Custom validation hook (library API only).** Since arbitrary logic
  can't be expressed in a JSON config, a library caller may pass
  `validate?: (page: Page) => Promise<{ passed: boolean; message: string }>`
  as a runner option. If provided, its result is combined (ANDed) with any
  configured declarative `success` criteria — same pattern as the existing
  `message`/`redirectUrl`/`response` checks, just one more check in the list.
  This is how a consumer expresses "run my own assertions against the final
  page" without our tool needing to anticipate every possible check.

### Multi-Step Config Schema (sketch)

```jsonc
{
  "name": "signup-wizard",
  "url": "https://example.com/signup",
  "openTrigger": "#open-signup-dialog",
  "dialogSelector": "#signup-dialog",
  "steps": [
    {
      "name": "account-details",
      "stepMarkerSelector": "#step-account",
      "fields": [
        { "name": "email", "selector": "#email", "type": "email", "required": true, "validValue": "user@example.com", "invalidValues": [{ "value": "", "expectedError": "#email-error" }] }
      ],
      "nextSelector": "#step-account-next"
    },
    {
      "name": "profile",
      "stepMarkerSelector": "#step-profile",
      "fields": [
        { "name": "displayName", "selector": "#displayName", "type": "text", "required": true, "validValue": "Jane", "invalidValues": [{ "value": "", "expectedError": "#name-error" }] }
      ],
      "nextSelector": "#step-profile-submit"
    }
  ],
  "success": {
    "message": { "selector": "#signup-success", "text": "Welcome" }
  },
  "snapshotSelectors": ["#signup-success", "#account-summary"]
}
```

### Implementation Roadmap Addition (increments 12-16)

12. Multi-step schema + config loader (`MultiStepFormConfig`, `FormStep`
    types; `loadMultiStepFormConfig` + validation). Refactor
    `fillFormFields` to accept a `FieldConfig[]` directly (rather than a
    whole `FormConfig`) so it's reusable for a single step's fields.
13. Two local fixtures proving the "one mechanism, two delivery styles"
    claim: (a) a 3-step wizard with all steps already in the DOM, hidden via
    CSS and revealed by JS on valid "Next" clicks, inside a dialog opened by
    a trigger button; (b) a 2-step wizard where step 2's markup is fetched
    and inserted into the DOM only after step 1's "Next" is clicked
    successfully, also inside a dialog.
14. `runMultiStepHappyPath` runner (+ snapshot/validate-hook support, also
    retrofitted to the existing `runHappyPathSubmission`), verified against
    both fixtures end-to-end.
15. `runMultiStepStepValidation` runner (per-step required/invalid-value
    checks + "did not advance" assertion), verified against both fixtures.
16. CLI/library wiring (auto-detect a multi-step config by the presence of
    `steps` vs. `fields`), README multi-step usage example, test reports.

## MCP Interface (AI-Driven Form Filling and Verification)

The tool gains a third interface alongside the CLI and library: an MCP
(Model Context Protocol) server, so an AI agent (Claude Code, Claude
Desktop, any MCP client) can fill and verify forms through tool calls
directly — either exploring a form interactively with no pre-written config,
or running the existing config-driven test suites as a single tool call.

**Same package, not a separate one.** The MCP server ships as an additional
`bin` entry in this package's `package.json` (`html-automation-mcp`,
matching the published package name so a bare `npx html-automation-mcp`
resolves to it directly), and its startup logic is also exported from the
library (`startMcpServer()`) so a consumer can embed it in their own process
rather than only spawning it as a standalone binary. This mirrors how the
CLI (`fill-forms`) and the library exports already coexist in one package.

### Functional Requirements

- **FR17 — MCP server, stdio transport.** A `Server`/`McpServer` (via the
  official `@modelcontextprotocol/sdk`) speaking MCP over stdio — the
  standard transport for a local, browser-driving tool like this one, since
  it has to run on the same machine as the browser it controls anyway. No
  HTTP/SSE transport in v1.
- **FR18 — Interactive session tools**, for AI-driven filling without a
  pre-written config. Sessions are explicit and stateful: an MCP tool call
  is a single stateless request, but filling a form is inherently multi-step
  (see something, act, see the result, act again), so a session must persist
  a real Playwright `Page` across multiple tool calls. Implemented as an
  in-memory `Map<sessionId, BrowserSession>` inside the server process,
  keyed by a generated UUID the AI passes back on every subsequent call.
  Tools:
  - `open_session(url, headless?)` → `{ sessionId }`
  - `close_session(sessionId)` → closes the browser, frees the session
  - `discover_fields(sessionId, withinSelector?)` → scans the page (or a
    scoped container) for form-like elements and returns, per element: a
    usable selector, tag/input type, `name`, associated label text (via
    `<label for>` or nearest wrapping `<label>`), current value, and whether
    it's marked required — so the AI doesn't need hand-authored selectors to
    get started.
  - `fill_field(sessionId, selector, type, value)` → reuses the existing
    `fillField` engine (all 10 field types), wrapping the input in a minimal
    ad hoc `FieldConfig`.
  - `click(sessionId, selector)` → generic click (submit buttons, "Next"
    controls, anything).
  - `inspect_element(sessionId, selector)` → reuses `inspectElement`
    directly (`{matched, visible, text}`).
  - `wait_for(sessionId, condition)` → reuses `performWaits` with a single
    `WaitCondition`.
  - `get_page_text(sessionId)` → the page's visible text (`innerText`),
    truncated to a sane length, for the AI to read context/error messages it
    doesn't have a selector for yet.
  - **Idle-session safety net**: a session unused for a configurable timeout
    (default e.g. 10 minutes) is closed automatically, so a crashed/forgetful
    MCP client doesn't leak Chromium processes indefinitely. Explicit
    `close_session` remains the normal path.
- **FR19 — Config-driven batch tools**, thin wrappers around the *existing*
  runners — no new test logic, just an MCP-shaped entry point:
  - `validate_form_config(config)` → schema validation only (accepts either
    shape; reuses `isMultiStepConfigData` + the matching `validate*`
    function), returns a clear pass/fail + error detail, no browser launched.
  - `run_form_test(config)` → runs the full single-step suite (required,
    format, cross-field, happy-path, double-submit, back-button) and returns
    the aggregated results, mirroring the CLI's `--json` report shape.
  - `run_multistep_form_test(config)` → runs `runMultiStepStepValidation` +
    `runMultiStepHappyPath` and returns the aggregated results.
  - `config` is accepted as an inline JSON object in every tool (an AI
    composing a config on the fly doesn't need a file on disk), with a file
    path also accepted as a convenience.
- **FR20 — Every tool fails gracefully.** Consistent with "Graceful failure,
  never a crash" elsewhere in this document: a tool call that hits an
  expected failure (bad selector, unknown session ID, invalid config, a
  timed-out wait) returns an MCP tool error result with a specific message —
  never an uncaught exception that kills the server process or leaves a
  client hanging.

### Implementation Roadmap (increments 17-20)

17. MCP server scaffold: add `@modelcontextprotocol/sdk` (and `zod` if the
    chosen tool-registration API calls for schema objects) as dependencies,
    stdio server setup, session store with idle-timeout cleanup, new `bin`
    entry, `startMcpServer()` library export. Verify by spawning the server
    as a real subprocess and speaking raw MCP JSON-RPC over its stdio
    (`initialize`, `tools/list`) — proving the protocol handshake actually
    works, not just that the code compiles.
18. Interactive session tools (FR18) — `open_session` through
    `get_page_text`. Verify against a real fixture via actual MCP tool
    calls over stdio: open a session, discover fields, fill one, click,
    inspect the result, close the session — the full interactive loop.
19. Config-driven batch tools (FR19) — verify against both a real single-step
    config and a multi-step config via actual tool calls, confirming results
    match what the CLI produces for the same config.
20. Polish: README section on configuring this as an MCP server in Claude
    Code (`.mcp.json` snippet) and other clients, final regression across
    CLI/library/MCP, test reports.

## Session Reuse via Playwright storageState

Some forms sit behind a login the tool has no way to complete on its own
(SSO, MFA, a login flow outside the scope of the form under test). Rather
than build a generic "log in first" mechanism, or — worse — read cookies out
of another Chrome profile on disk (fragile across OS/Chrome versions since
cookie stores are encrypted at the OS level, and a real security concern
since it would expose every site's session in that profile, not just the
one being tested), the tool adopts Playwright's own standard mechanism.

- **FR21 — `storageState`.** `FormConfig` and `MultiStepFormConfig` gain an
  optional `storageState: string | object` field (a file path, or the state
  already parsed) — Playwright's own cookies + per-origin localStorage
  format, produced by `context.storageState()`. A user logs in once (by
  hand, or with a short one-off Playwright script), saves the resulting
  file, and points the config at it; every subsequent automated run starts
  already authenticated. `openFormPage`/`OpenFormPageOptions` carries the
  same option through at the library level, and the MCP `open_session` tool
  exposes it directly as a parameter for interactive use. A malformed
  storageState fails with a specific error at session-start time — never a
  crash.

This is deliberately scoped to *reusing* an existing session, not automating
the login itself — capturing/refreshing the storageState file is the
consumer's responsibility (typically a one-time manual step, or their own
scripted login flow, outside this tool).
