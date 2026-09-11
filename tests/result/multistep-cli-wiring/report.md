# multi-step CLI/library wiring + README — test report

**Feature:** loop increment 16 (final of the multi-step sub-roadmap) — CLI/library wiring, README, full regression
**Date:** 2026-09-11

## What was implemented
- **`src/config.ts`**: exported `readJsonConfigFile` (was private) and extracted `resolveConfigPaths(target)` (file-or-directory-of-`*.json` resolution) out of `loadFormConfigs`, which now just maps over it — same behavior, reusable by the CLI.
- **`src/cli.ts`**: each resolved file path is read once and routed by `loadAnyConfig` — `isMultiStepConfigData` on the parsed JSON decides whether to `validateFormConfig` or `validateMultiStepFormConfig`, so **a directory can freely mix single-step and multi-step config files**; each is detected independently rather than the whole directory being one shape. This was the key design decision for this increment — chosen over separate CLI arguments/entry points because it requires no new flags and matches how the library-level `isMultiStepConfigData` was already designed in increment 12 for exactly this purpose.
  - A multi-step config runs `runMultiStepStepValidation` + `runMultiStepHappyPath` (not the single-step required/format runners — `runMultiStepStepValidation` already covers both empty-value and non-empty invalid cases per step in one pass, so the console/JSON output labels it "step validation", distinct from single-step's separate "required-field validation" / "format/pattern validation" sections, to keep that asymmetry legible rather than papering over it).
  - `JsonReport.forms` is now `(FormReport | MultiStepFormReport)[]`, each tagged with a `kind: "single" | "multi"` discriminant; a shared `printSubmissionResult` helper de-duplicated the happy-path-printing logic between the two report functions.
- **`src/index.ts`**: exported `readJsonConfigFile` and `resolveConfigPaths`. All other multi-step symbols (`MultiStepFormConfig`, `FormStep`, `WaitCondition`, `loadMultiStepFormConfig`, `validateMultiStepFormConfig`, `isMultiStepConfigData`, `runMultiStepHappyPath`, `runMultiStepStepValidation`, `SnapshotEntry`, `SubmissionValidator`) were already exported by increments 12/14/15 — confirmed, no gaps.
- **`README.md`**: new "Multi-step forms (wizards in a dialog)" section — a trimmed config snippet, CLI invocation, library usage (`loadMultiStepFormConfig`, `runMultiStepStepValidation`, `runMultiStepHappyPath`), a summary of `waits`/`snapshotSelectors`/`validate` with a pointer to `docs/requirements.md`, and a note that mixed directories work transparently.

## Verification
| Case | Command | Expected | Result |
|---|---|---|---|
| Multi-step config, real fixture | `node dist/cli.js fixtures/multi-step/hidden-dom-wizard/config.json` | Detected as multi-step, runs step validation + happy path, exit 0 | PASS — 4 passed, 0 failed, 0 skipped, exit 0 |
| Single-step regression | `node dist/cli.js examples/login-form.config.json` | Unchanged behavior | PASS — 6 passed, 0 failed, 2 skipped, exit 0 |
| **Mixed directory** (one single-step + one multi-step config file) | `node dist/cli.js <mixed-dir> --json report.json` | Both files detected independently and run with their correct runners; combined summary | PASS — 10 passed, 0 failed, 2 skipped total; JSON report's two entries correctly tagged `kind: "single"` (with `requiredFieldValidation`) and `kind: "multi"` (with `stepValidation`) |
| Full regression: typecheck, build, `npm pack --dry-run` | — | All clean | PASS — 58 files packed, no errors |

## Notes
This completes the entire multi-step sub-roadmap (increments 12-16), built on top of the original 11-increment roadmap. The tool now supports: hosted single-step forms (original scope) and hosted multi-step wizards in a dialog, with step content delivered either already-in-DOM-hidden or dynamically-loaded — both proven to work through the identical runner code (increment 14's key finding).
