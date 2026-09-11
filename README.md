# form-test-automation

Playwright-based automated testing for hosted HTML forms — declare a form's
fields, validation rules, and success criteria in a JSON config, and this
tool fills them, submits, and checks the results. Works as a standalone CLI
(via `npx`) or as a library imported into another Node/TypeScript project.

## Install

```bash
npm install form-test-automation
```

Or run it without installing, via `npx` (see CLI usage below).

The first time you use it locally, make sure Playwright's Chromium build is
installed:

```bash
npx playwright install chromium
```

## CLI usage

```bash
# Run a single form config
npx fill-forms path/to/form.config.json

# Run every *.json config in a directory
npx fill-forms path/to/configs/

# Also write a machine-readable JSON report
npx fill-forms path/to/form.config.json --json report.json
```

The CLI exits `0` if every test case passed (or was skipped), and non-zero
if anything failed — so it's safe to use as a CI gate. See
`examples/login-form.config.json` for a complete, working config.

## Library usage

The same test-running functions are exported for use inside another
project's own test suite or scripts — no CLI required.

**TypeScript / ESM-style import:**

```ts
import {
  loadFormConfig,
  runRequiredFieldValidation,
  runFieldFormatValidation,
  runHappyPathSubmission,
  type FormConfig,
} from "form-test-automation";

const config: FormConfig = loadFormConfig("path/to/form.config.json");

const required = await runRequiredFieldValidation(config);
const happyPath = await runHappyPathSubmission(config);

console.log(happyPath.status); // "passed" | "failed"
```

**Plain JavaScript / CommonJS:**

```js
const { loadFormConfig, runHappyPathSubmission } = require("form-test-automation");

(async () => {
  const config = loadFormConfig("path/to/form.config.json");
  const result = await runHappyPathSubmission(config);
  if (result.status !== "passed") {
    process.exitCode = 1;
  }
})();
```

Every exported function returns plain, typed result objects
(`ValidationCaseResult[]`, `SubmissionResult`, etc.) — nothing throws for an
expected test outcome (a failed assertion is a `status: "failed"` result,
not an exception). See `docs/requirements.md` for the full list of exports
and their shapes.

## Writing a form config

A config describes one form: its URL, each field's selector/type/valid and
invalid values, the submit control, and what counts as success. The full
schema, field types, and every option are documented in
[`docs/requirements.md`](docs/requirements.md) ("Form Config Schema"
section); [`docs/test-cases.md`](docs/test-cases.md) documents the test
case design this tool is built to cover, including a large edge-case
checklist. [`examples/login-form.config.json`](examples/login-form.config.json)
is a complete, real, working example against a public test site.

## What gets tested

For each config, the CLI/library runs:
- **Required-field validation** — each required field left empty, others valid.
- **Format/pattern validation** — each field's configured invalid values (bad email, length limits, pattern mismatches, etc.).
- **Cross-field validation** — optional multi-field scenarios (e.g. password/confirm mismatch), if configured.
- **Happy-path submission** — every field filled validly, checking the configured success criteria (message, redirect, network response).
- **Double-submit / back-button checks** — basic resilience checks around resubmission and browser navigation.

## Future expansion

Only hosted forms (reachable by URL) are supported today. Local HTML files
and PDF forms are noted as future scope in `docs/requirements.md` but are
not implemented yet.

## Development

```bash
npm install
npm run build       # compile TypeScript to dist/
npm run typecheck   # type-check without emitting
```

Verification for each increment of this project's development is recorded
under [`tests/result/`](tests/result/), one folder per feature.
