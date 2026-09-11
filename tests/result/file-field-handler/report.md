# file field handler — test report

**Feature:** file upload field handler (`fillFileField` in `src/field-handlers/file.ts`)
**Date:** 2026-09-11

## What was implemented
`fillFileField` waits for the target `<input type="file">` locator to reach `state: "attached"` (not `"visible"`, since file inputs are commonly hidden behind a custom label/button) within `timeoutMs`, then calls `locator.setInputFiles(value)` with `value` as the filesystem path to upload.

## Verification
Fixture: http://127.0.0.1:8934/index.html (`#resume` file input)

| Case | Expected | Result |
|---|---|---|
| Upload resume.txt | files.length === 1, files[0].name === "resume.txt" | PASS |

Verification steps: built the package with `npm run build` (compiling `src/field-handlers/file.ts` to `dist/field-handlers/file.js`), then ran a Node script that launched headless Chromium via `playwright`, navigated to the fixture page, called the compiled `fillFileField(page, field, resumePath, 10000)` against `#resume`, and asserted `el.files.length === 1` and `el.files[0].name === "resume.txt"` via `locator.evaluate`. Both assertions passed:

```
OK: files.length === 1
OK: files[0].name === "resume.txt"
ALL CHECKS PASSED
```

## Notes
None
