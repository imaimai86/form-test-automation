#!/usr/bin/env node

import * as fs from "node:fs";
import { resolveConfigPaths, readJsonConfigFile, isMultiStepConfigData, validateFormConfig, validateMultiStepFormConfig } from "./config";
import {
  runRequiredFieldValidation,
  runFieldFormatValidation,
  runHappyPathSubmission,
  runCrossFieldValidation,
  runDoubleSubmitCheck,
  runBackButtonCheck,
  runMultiStepStepValidation,
  runMultiStepHappyPath,
  ValidationCaseResult,
  SubmissionResult,
} from "./runner";
import { FormConfig, MultiStepFormConfig } from "./types";

interface FormTally {
  passed: number;
  failed: number;
  skipped: number;
}

interface FormReport {
  kind: "single";
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

interface MultiStepFormReport {
  kind: "multi";
  name: string;
  url: string;
  stepValidation: ValidationCaseResult[];
  happyPathSubmission: SubmissionResult;
  summary: FormTally;
}

interface JsonReport {
  generatedAt: string;
  forms: (FormReport | MultiStepFormReport)[];
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

function printSubmissionResult(label: string, submission: SubmissionResult, tally: FormTally): void {
  if (submission.status === "passed") {
    tally.passed++;
  } else {
    tally.failed++;
  }
  console.log(`  [${submission.status === "passed" ? "PASS" : "FAIL"}] ${label}: ${submission.message}`);
  for (const check of submission.checks) {
    console.log(`      - ${check.criterion}: ${check.passed ? "PASS" : "FAIL"} - ${check.message}`);
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
  printSubmissionResult("happy-path submission", submission, tally);

  const doubleSubmit = await runDoubleSubmitCheck(config);
  tally[doubleSubmit.status]++;
  console.log(`  [${tagFor(doubleSubmit.status)}] double-submit check: ${doubleSubmit.message}`);

  const backButton = await runBackButtonCheck(config);
  tally[backButton.status]++;
  console.log(`  [${tagFor(backButton.status)}] back-button check: ${backButton.message}`);

  console.log(`  Summary: ${tally.passed} passed, ${tally.failed} failed, ${tally.skipped} skipped`);

  return {
    kind: "single",
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

/**
 * Unlike the single-step path, a multi-step form has no separate
 * required-field vs. format-validation runners — runMultiStepStepValidation
 * covers both empty-value and non-empty invalidValues cases per step in one
 * pass, so it's reported here as one "step validation" section rather than
 * two.
 */
async function runMultiStepForm(config: MultiStepFormConfig): Promise<MultiStepFormReport> {
  console.log(`\n${config.name} (${config.url}) [multi-step]`);

  const tally: FormTally = { passed: 0, failed: 0, skipped: 0 };

  const stepValidation = await runMultiStepStepValidation(config);
  printCaseResults("step validation", stepValidation, tally);

  const submission = await runMultiStepHappyPath(config);
  printSubmissionResult("happy-path submission", submission, tally);

  console.log(`  Summary: ${tally.passed} passed, ${tally.failed} failed, ${tally.skipped} skipped`);

  return {
    kind: "multi",
    name: config.name,
    url: config.url,
    stepValidation,
    happyPathSubmission: submission,
    summary: tally,
  };
}

type LoadedConfig = { kind: "single"; config: FormConfig } | { kind: "multi"; config: MultiStepFormConfig };

/** Reads a config file once and routes it to the right validator based on its shape (presence of "steps" vs "fields"). */
function loadAnyConfig(filePath: string): LoadedConfig {
  const data = readJsonConfigFile(filePath);
  if (isMultiStepConfigData(data)) {
    return { kind: "multi", config: validateMultiStepFormConfig(data, filePath) };
  }
  return { kind: "single", config: validateFormConfig(data, filePath) };
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

  const filePaths = resolveConfigPaths(configPath);

  const forms: (FormReport | MultiStepFormReport)[] = [];
  const total: FormTally = { passed: 0, failed: 0, skipped: 0 };
  for (const filePath of filePaths) {
    const loaded = loadAnyConfig(filePath);
    const report = loaded.kind === "single" ? await runForm(loaded.config) : await runMultiStepForm(loaded.config);
    forms.push(report);
    total.passed += report.summary.passed;
    total.failed += report.summary.failed;
    total.skipped += report.summary.skipped;
  }

  console.log(`\n${filePaths.length} form(s) tested, ${total.failed} failing case(s) total.`);

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
