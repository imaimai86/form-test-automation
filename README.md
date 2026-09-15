# html-automation-mcp

Playwright-based automated testing for hosted HTML forms — declare a form's
fields, validation rules, and success criteria in a JSON config, and this
tool fills them, submits, and checks the results. Three interfaces, one
package: a standalone CLI (via `npx`), a library imported into another
Node/TypeScript project, and an MCP server so an AI agent can fill and
verify forms through tool calls.

## Install

```bash
npm install html-automation-mcp
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
} from "html-automation-mcp";

const config: FormConfig = loadFormConfig("path/to/form.config.json");

const required = await runRequiredFieldValidation(config);
const happyPath = await runHappyPathSubmission(config);

console.log(happyPath.status); // "passed" | "failed"
```

**Plain JavaScript / CommonJS:**

```js
const { loadFormConfig, runHappyPathSubmission } = require("html-automation-mcp");

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

## Multi-step forms (wizards in a dialog)

A separate config shape handles multi-step wizards — including ones inside a
modal/dialog, and steps that arrive already in the DOM (just hidden) or get
inserted dynamically after an AJAX call. The CLI and library both
auto-detect this shape (presence of `"steps"` instead of `"fields"`) with no
extra flags:

```jsonc
{
  "name": "signup-wizard",
  "url": "https://example.com/signup",
  "openTrigger": "#open-signup-dialog",
  "dialogSelector": "#signup-dialog",
  "steps": [
    {
      "name": "account",
      "stepMarkerSelector": "#step-account",
      "fields": [
        { "name": "email", "selector": "#email", "type": "email", "required": true, "validValue": "user@example.com", "invalidValues": [{ "value": "", "expectedError": "#email-error" }] }
      ],
      "nextSelector": "#account-next"
    },
    {
      "name": "profile",
      "stepMarkerSelector": "#step-profile",
      "fields": [
        { "name": "displayName", "selector": "#displayName", "type": "text", "required": true, "validValue": "Jane", "invalidValues": [{ "value": "", "expectedError": "#name-error" }] }
      ],
      "nextSelector": "#profile-submit"
    }
  ],
  "success": { "message": { "selector": "#signup-success", "text": "Welcome" } }
}
```

```bash
npx fill-forms path/to/wizard.config.json
```

```ts
import { loadMultiStepFormConfig, runMultiStepStepValidation, runMultiStepHappyPath } from "html-automation-mcp";

const config = loadMultiStepFormConfig("path/to/wizard.config.json");

const stepIssues = await runMultiStepStepValidation(config); // per-step required/format checks, blocks-advancement asserted
const result = await runMultiStepHappyPath(config);           // fills every step, submits, checks success criteria
```

Additional capabilities available on both the single-step and multi-step
shapes — see `docs/requirements.md` ("Multi-Step Forms (in a Dialog)") for
full detail:
- **`waits`** (top-level or per-step) — wait for a selector, a field's value, or a fixed delay before proceeding, for content that's still settling (a loading spinner, a value populated by another field's change handler, a freshly-inserted step).
- **`snapshotSelectors`** — captures each selector's matched/visible/text state on the submission result, for post-hoc inspection without re-running.
- **`validate`** (library option, both `runHappyPathSubmission` and `runMultiStepHappyPath`) — a custom `(page) => Promise<{passed, message}>` hook, ANDed with the declarative success criteria, for logic beyond selector/text matching.

A mixed directory of single-step and multi-step config files works
transparently — each file's shape is detected independently.

## MCP server (AI-driven form filling and verification)

The same package ships an MCP ([Model Context Protocol](https://modelcontextprotocol.io))
server, so an AI agent can drive form filling and verification through tool
calls — either exploring a form interactively with no pre-written config, or
running the exact same test suites the CLI runs as a single tool call. Stdio
transport only.

**Claude Code** — add to `.mcp.json` in your project (or via `claude mcp add`):

```json
{
  "mcpServers": {
    "html-automation-mcp": {
      "command": "npx",
      "args": ["-y", "html-automation-mcp"]
    }
  }
}
```

(Any other MCP client that supports stdio servers configures the same way —
point it at the `html-automation-mcp` command, which resolves directly since
it matches the package name.)

**Embedding directly** (no separate process):

```ts
import { startMcpServer } from "html-automation-mcp";

await startMcpServer({ idleTimeoutMs: 10 * 60 * 1000 }); // default shown
```

### Tools

**Interactive** (explore and fill a form with no pre-written config — a
session persists a real browser page across calls):

| Tool | Purpose |
|---|---|
| `open_session(url, headless?, storageState?)` | Opens a page, returns `sessionId`; pass `storageState` to start already logged in |
| `close_session(sessionId)` | Closes it |
| `discover_fields(sessionId, withinSelector?)` | Best-effort scan for form fields: selector, type, label, value, required |
| `fill_field(sessionId, selector, type, value)` | Fills one field (all 10 field types) |
| `click(sessionId, selector)` | Clicks an element |
| `inspect_element(sessionId, selector)` | Reads a selector's matched/visible/text state |
| `wait_for(sessionId, condition, timeoutMs?)` | Waits for a selector state, a value, or a fixed delay |
| `get_page_text(sessionId)` | Visible page text (truncated) |

A session left idle past `idleTimeoutMs` (default 10 minutes) is closed
automatically, so a crashed or forgetful client doesn't leak browser
processes — `close_session` remains the normal path.

**Config-driven batch** (thin wrappers around the exact same runners the CLI
uses — `config` accepts a file path or an inline JSON object):

| Tool | Purpose |
|---|---|
| `validate_form_config(config)` | Schema check only, no browser launched |
| `run_form_test(config, headless?, timeoutMs?)` | Full single-step suite |
| `run_multistep_form_test(config, headless?, timeoutMs?)` | Full multi-step suite |

## Testing forms behind a login (storageState)

For a form behind SSO/MFA/a login flow this tool can't complete on its own,
reuse an already-authenticated session instead of automating the login.
Log in once (by hand, or with a one-off Playwright script) and save the
session:

```ts
// one-time script, run manually
import { chromium } from "playwright";
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.goto("https://example.com/login");
// ... log in manually in the opened window ...
await page.context().storageState({ path: "auth.json" });
await browser.close();
```

Then point a config at the saved file — every run starts already logged in:

```json
{
  "name": "account-settings",
  "url": "https://example.com/settings",
  "storageState": "auth.json",
  "submitSelector": "#save",
  "fields": [ /* ... */ ],
  "success": { "message": { "selector": "#saved" } }
}
```

Works the same way as a library option (`runHappyPathSubmission(config, { storageState: "auth.json" })`)
and as an MCP tool parameter (`open_session({ url, storageState: "auth.json" })`).
`storageState` accepts either a file path or the state as an inline object.

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

## License

[The Unlicense](LICENSE) — public domain. Use it for anything, no attribution required.
