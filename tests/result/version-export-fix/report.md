# VERSION export drift fix — test report

**Feature:** bug fix — the exported `VERSION` constant and the MCP server's reported `serverInfo.version` were hardcoded string literals, independent of `package.json`
**Date:** 2026-09-15

## What happened
Discovered while verifying the freshly-published `html-automation-mcp@0.1.1`: a fresh registry install reported `VERSION: "0.1.0"` even though `package.json`'s actual version was `0.1.1`. Root cause: `src/index.ts` had `export const VERSION = "0.1.0";` as a hand-maintained literal, and `src/mcp/server.ts` had its own separate hardcoded `MCP_SERVER_VERSION = "0.1.0"` — neither was ever updated by `npm version`, so both silently drifted out of sync with the real package version on every release.

## What was implemented
- **`src/version.ts`** (new): reads `package.json`'s `version` field at runtime by walking upward from the compiled file's own directory until `package.json` is found — works correctly regardless of how deeply nested the calling file is (`dist/version.js` vs `dist/mcp/server.js`) without each caller needing its own hardcoded relative-path guess, and can never drift from `package.json` again since there's no literal to forget to update.
- `src/index.ts`: `export const VERSION = "0.1.0"` replaced with `export { VERSION } from "./version"`.
- `src/mcp/server.ts`: hardcoded `MCP_SERVER_VERSION` replaced with importing `VERSION` from `./version` (this also removed the reason for the earlier "avoid circular import" workaround — `version.ts` doesn't import from either file, so there's no cycle).

## Verification
| Case | Expected | Result |
|---|---|---|
| Library `require("html-automation-mcp").VERSION` (built from source, version `0.1.1`) | `"0.1.1"` | PASS |
| MCP server `initialize` response `serverInfo.version` (real spawned subprocess) | `"0.1.1"` | PASS |
| `npm run typecheck`, `npm run build` | Clean | PASS |
| Full CLI regression against `examples/login-form.config.json` | Unchanged (6 passed, 0 failed, 2 skipped) | PASS |

## Notes
`html-automation-mcp@0.1.0` and `0.1.1` on the npm registry both still report the stale `VERSION` value (`"0.1.0"`) since this fix landed after `0.1.1` was published — this is source-only until the next version bump/publish.
