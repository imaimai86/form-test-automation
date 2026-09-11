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
