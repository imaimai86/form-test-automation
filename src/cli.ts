#!/usr/bin/env node

import * as fs from "node:fs";
import { resolveConfigPaths, readJsonConfigFile, isMultiStepConfigData, validateFormConfig, validateMultiStepFormConfig } from "./config";
import { computeFormReport, computeMultiStepFormReport, FormReport, MultiStepFormReport, FormTally } from "./report";
import { ValidationCaseResult, SubmissionResult } from "./runner";
import { FormConfig, MultiStepFormConfig } from "./types";

interface JsonReport {
  generatedAt: string;
  forms: (FormReport | MultiStepFormReport)[];
  summary: FormTally;
}

function tagFor(status: "passed" | "failed" | "skipped"): string {
  return status === "passed" ? "PASS" : status === "skipped" ? "SKIP" : "FAIL";
}

function printCaseResults(label: string, results: ValidationCaseResult[]): void {
  for (const r of results) {
    const suffix = r.value ? ` ("${r.value}")` : "";
    console.log(`  [${tagFor(r.status)}] ${label} - ${r.fieldName}${suffix}: ${r.message}`);
  }
}

function printSubmissionResult(label: string, submission: SubmissionResult): void {
  console.log(`  [${submission.status === "passed" ? "PASS" : "FAIL"}] ${label}: ${submission.message}`);
  for (const check of submission.checks) {
    console.log(`      - ${check.criterion}: ${check.passed ? "PASS" : "FAIL"} - ${check.message}`);
  }
}

async function runForm(config: FormConfig): Promise<FormReport> {
  console.log(`\n${config.name} (${config.url})`);
  const report = await computeFormReport(config);

  printCaseResults("required-field validation", report.requiredFieldValidation);
  printCaseResults("format/pattern validation", report.formatValidation);
  printCaseResults("cross-field validation", report.crossFieldValidation);
  printSubmissionResult("happy-path submission", report.happyPathSubmission);
  console.log(`  [${tagFor(report.doubleSubmit.status)}] double-submit check: ${report.doubleSubmit.message}`);
  console.log(`  [${tagFor(report.backButton.status)}] back-button check: ${report.backButton.message}`);
  console.log(`  Summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped`);

  return report;
}

async function runMultiStepForm(config: MultiStepFormConfig): Promise<MultiStepFormReport> {
  console.log(`\n${config.name} (${config.url}) [multi-step]`);
  const report = await computeMultiStepFormReport(config);

  printCaseResults("step validation", report.stepValidation);
  printSubmissionResult("happy-path submission", report.happyPathSubmission);
  console.log(`  Summary: ${report.summary.passed} passed, ${report.summary.failed} failed, ${report.summary.skipped} skipped`);

  return report;
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
  console.error(`html-automation-mcp: ${message}`);
  process.exitCode = 1;
});
