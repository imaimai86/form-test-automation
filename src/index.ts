/**
 * Library entry point. Re-exports the config types consumers author
 * form definitions against. Runner logic lands in later increments.
 */

export * from "./types";
export * from "./errors";
export { loadFormConfig, loadFormConfigs, validateFormConfig } from "./config";
export { loadMultiStepFormConfig, validateMultiStepFormConfig, isMultiStepConfigData } from "./config";
export { openFormPage, closeSession, BrowserSession, OpenFormPageOptions, NavigationError } from "./browser";
export { fillField, FieldFiller, FieldNotFoundError, FieldFillError } from "./fields";
export { performWaits } from "./waits";
export { runRequiredFieldValidation, runFieldFormatValidation, ValidationCaseResult, ValidationCaseStatus } from "./runner";
export { runHappyPathSubmission, SubmissionResult, SuccessCheckResult, SuccessCriterionKind, SnapshotEntry, SubmissionValidator } from "./runner";
export { runCrossFieldValidation, runDoubleSubmitCheck, runBackButtonCheck } from "./runner";
export { runMultiStepHappyPath } from "./runner";

export const VERSION = "0.1.0";
