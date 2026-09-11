#!/usr/bin/env node

import { loadFormConfigs } from "./config";
import { runRequiredFieldValidation, runFieldFormatValidation, runHappyPathSubmission, ValidationCaseResult } from "./runner";
import { FormConfig } from "./types";

interface FormTally {
  passed: number;
  failed: number;
  skipped: number;
}

function tagFor(status: "passed" | "failed" | "skipped"): string {
  return status === "passed" ? "PASS" : status === "skipped" ? "SKIP" : "FAIL";
}

function printCaseResults(label: string, results: ValidationCaseResult[], tally: FormTally): void {
  for (const r of results) {
    tally[r.status]++;
    const suffix = r.value ? ` ("${r.value}")` : "";
    console.log(`  [${tagFor(r.status)}] ${label} - ${r.fieldName}${suffix}: ${r.message}`);
  }
}

async function runForm(config: FormConfig): Promise<FormTally> {
  console.log(`\n${config.name} (${config.url})`);

  const tally: FormTally = { passed: 0, failed: 0, skipped: 0 };

  const required = await runRequiredFieldValidation(config);
  printCaseResults("required-field validation", required, tally);

  const format = await runFieldFormatValidation(config);
  printCaseResults("format/pattern validation", format, tally);

  const submission = await runHappyPathSubmission(config);
  if (submission.status === "passed") {
    tally.passed++;
  } else {
    tally.failed++;
  }
  console.log(`  [${submission.status === "passed" ? "PASS" : "FAIL"}] happy-path submission: ${submission.message}`);
  for (const check of submission.checks) {
    console.log(`      - ${check.criterion}: ${check.passed ? "PASS" : "FAIL"} - ${check.message}`);
  }

  console.log(`  Summary: ${tally.passed} passed, ${tally.failed} failed, ${tally.skipped} skipped`);
  return tally;
}

async function main(): Promise<void> {
  const [, , configPath] = process.argv;

  if (!configPath) {
    console.error("Usage: fill-forms <config-file-or-directory>");
    process.exitCode = 1;
    return;
  }

  const configs = loadFormConfigs(configPath);

  let totalFailed = 0;
  for (const config of configs) {
    const tally = await runForm(config);
    totalFailed += tally.failed;
  }

  console.log(`\n${configs.length} form(s) tested, ${totalFailed} failing case(s) total.`);
  if (totalFailed > 0) {
    process.exitCode = 1;
  }
}

// Last-resort safety net: an expected failure (bad config, missing selector,
// network error, etc.) should already be caught and reported clearly at the
// point it happens by the runner/loader (see docs/requirements.md, "Graceful
// failure, never a crash"). This only guards against something unexpected
// slipping through, so users never see a raw stack trace.
main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`form-test-automation: ${message}`);
  process.exitCode = 1;
});
