import { FormConfig, MultiStepFormConfig } from "./types";
import {
  runRequiredFieldValidation,
  runFieldFormatValidation,
  runCrossFieldValidation,
  runHappyPathSubmission,
  runDoubleSubmitCheck,
  runBackButtonCheck,
  runMultiStepStepValidation,
  runMultiStepHappyPath,
  ValidationCaseResult,
  SubmissionResult,
} from "./runner";
import { OpenFormPageOptions } from "./browser";

export interface FormTally {
  passed: number;
  failed: number;
  skipped: number;
}

export interface FormReport {
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

/**
 * Unlike the single-step report, a multi-step form has no separate
 * required-field vs. format-validation runners — runMultiStepStepValidation
 * covers both empty-value and non-empty invalidValues cases per step in one
 * pass, so it's reported here as one "step validation" section rather than
 * two.
 */
export interface MultiStepFormReport {
  kind: "multi";
  name: string;
  url: string;
  stepValidation: ValidationCaseResult[];
  happyPathSubmission: SubmissionResult;
  summary: FormTally;
}

function tallyCaseResults(results: ValidationCaseResult[], tally: FormTally): void {
  for (const r of results) tally[r.status]++;
}

function tallySubmission(submission: SubmissionResult, tally: FormTally): void {
  if (submission.status === "passed") {
    tally.passed++;
  } else {
    tally.failed++;
  }
}

/**
 * Runs the full single-step test suite (required, format, cross-field,
 * happy-path, double-submit, back-button) and aggregates the results. Pure
 * computation, no I/O beyond the browser — this is the shared basis for
 * both the CLI's console/JSON output and the MCP run_form_test tool, so
 * neither has to duplicate the run-and-tally logic, and neither writes to
 * stdout from in here (important for MCP, which reserves stdout for the
 * protocol itself).
 */
export async function computeFormReport(
  config: FormConfig,
  options: OpenFormPageOptions & { timeoutMs?: number } = {}
): Promise<FormReport> {
  const tally: FormTally = { passed: 0, failed: 0, skipped: 0 };

  const requiredFieldValidation = await runRequiredFieldValidation(config, options);
  tallyCaseResults(requiredFieldValidation, tally);

  const formatValidation = await runFieldFormatValidation(config, options);
  tallyCaseResults(formatValidation, tally);

  const crossFieldValidation = await runCrossFieldValidation(config, options);
  tallyCaseResults(crossFieldValidation, tally);

  const happyPathSubmission = await runHappyPathSubmission(config, options);
  tallySubmission(happyPathSubmission, tally);

  const doubleSubmit = await runDoubleSubmitCheck(config, options);
  tally[doubleSubmit.status]++;

  const backButton = await runBackButtonCheck(config, options);
  tally[backButton.status]++;

  return {
    kind: "single",
    name: config.name,
    url: config.url,
    requiredFieldValidation,
    formatValidation,
    crossFieldValidation,
    happyPathSubmission,
    doubleSubmit,
    backButton,
    summary: tally,
  };
}

/** Multi-step equivalent of computeFormReport: runMultiStepStepValidation + runMultiStepHappyPath. */
export async function computeMultiStepFormReport(
  config: MultiStepFormConfig,
  options: OpenFormPageOptions & { timeoutMs?: number } = {}
): Promise<MultiStepFormReport> {
  const tally: FormTally = { passed: 0, failed: 0, skipped: 0 };

  const stepValidation = await runMultiStepStepValidation(config, options);
  tallyCaseResults(stepValidation, tally);

  const happyPathSubmission = await runMultiStepHappyPath(config, options);
  tallySubmission(happyPathSubmission, tally);

  return {
    kind: "multi",
    name: config.name,
    url: config.url,
    stepValidation,
    happyPathSubmission,
    summary: tally,
  };
}
