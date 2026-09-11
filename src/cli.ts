#!/usr/bin/env node

import * as fs from "node:fs";
import { loadFormConfigs } from "./config";
import {
  runRequiredFieldValidation,
  runFieldFormatValidation,
  runHappyPathSubmission,
  runCrossFieldValidation,
  runDoubleSubmitCheck,
  runBackButtonCheck,
  ValidationCaseResult,
  SubmissionResult,
} from "./runner";
import { FormConfig } from "./types";

interface FormTally {
  passed: number;
  failed: number;
  skipped: number;
}

interface FormReport {
  name: string;
  url: string;
  requiredFieldValidation: ValidationCaseResult[];
  formatValidation: ValidationCaseResult[];
  crossFieldValidation: ValidationCaseResult[];
  happyPathSubmission: SubmissionResult;
  doubleSubmit: ValidationCaseResult;
  backButton: ValidationCaseResult;
  summary: FormTally;
}

interface JsonReport {
  generatedAt: string;
  forms: FormReport[];
  summary: FormTally;
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

async function runForm(config: FormConfig): Promise<FormReport> {
  console.log(`\n${config.name} (${config.url})`);

  const tally: FormTally = { passed: 0, failed: 0, skipped: 0 };

  const required = await runRequiredFieldValidation(config);
  printCaseResults("required-field validation", required, tally);

  const format = await runFieldFormatValidation(config);
  printCaseResults("format/pattern validation", format, tally);

  const crossField = await runCrossFieldValidation(config);
  printCaseResults("cross-field validation", crossField, tally);

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

  const doubleSubmit = await runDoubleSubmitCheck(config);
  tally[doubleSubmit.status]++;
  console.log(`  [${tagFor(doubleSubmit.status)}] double-submit check: ${doubleSubmit.message}`);

  const backButton = await runBackButtonCheck(config);
  tally[backButton.status]++;
  console.log(`  [${tagFor(backButton.status)}] back-button check: ${backButton.message}`);

  console.log(`  Summary: ${tally.passed} passed, ${tally.failed} failed, ${tally.skipped} skipped`);

  return {
    name: config.name,
    url: config.url,
    requiredFieldValidation: required,
    formatValidation: format,
    crossFieldValidation: crossField,
    happyPathSubmission: submission,
    doubleSubmit,
    backButton,
    summary: tally,
  };
}

interface ParsedArgs {
  configPath?: string;
  jsonReportPath?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") {
      parsed.jsonReportPath = argv[i + 1];
      i++;
    } else if (parsed.configPath === undefined) {
      parsed.configPath = arg;
    }
  }
  return parsed;
}

async function main(): Promise<void> {
  const { configPath, jsonReportPath } = parseArgs(process.argv.slice(2));

  if (!configPath) {
    console.error("Usage: fill-forms <config-file-or-directory> [--json <report-path>]");
    process.exitCode = 1;
    return;
  }

  const hasJsonFlag = process.argv.includes("--json");
  if (hasJsonFlag && !jsonReportPath) {
    console.error("Usage: fill-forms <config-file-or-directory> [--json <report-path>] (--json requires a path)");
    process.exitCode = 1;
    return;
  }

  const configs = loadFormConfigs(configPath);

  const forms: FormReport[] = [];
  const total: FormTally = { passed: 0, failed: 0, skipped: 0 };
  for (const config of configs) {
    const report = await runForm(config);
    forms.push(report);
    total.passed += report.summary.passed;
    total.failed += report.summary.failed;
    total.skipped += report.summary.skipped;
  }

  console.log(`\n${configs.length} form(s) tested, ${total.failed} failing case(s) total.`);

  if (jsonReportPath) {
    const report: JsonReport = { generatedAt: new Date().toISOString(), forms, summary: total };
    try {
      fs.writeFileSync(jsonReportPath, JSON.stringify(report, null, 2));
      console.log(`JSON report written to ${jsonReportPath}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`Could not write JSON report to "${jsonReportPath}": ${reason}`);
      process.exitCode = 1;
      return;
    }
  }

  if (total.failed > 0) {
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
