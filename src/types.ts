/**
 * Config-driven form definition types.
 * Shape matches the schema documented in docs/requirements.md.
 */

export type FieldType =
  | "text"
  | "email"
  | "phone"
  | "password"
  | "number"
  | "select"
  | "checkbox"
  | "radio"
  | "textarea"
  | "date"
  | "file";

export interface InvalidValueCase {
  /** The value to fill into the field to trigger a validation error. */
  value: string;
  /** Selector (and/or text) identifying where the expected error should appear. */
  expectedError: string;
}

export interface FieldConfig {
  /** Logical name for this field, used in reports. */
  name: string;
  /** CSS/Playwright selector locating the field on the page. */
  selector: string;
  type: FieldType;
  required?: boolean;
  /** A value that should pass validation for this field. */
  validValue: string;
  /** Values that should each trigger a validation error when submitted. */
  invalidValues?: InvalidValueCase[];
  /** Optional additional validation constraints, checked where applicable. */
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
}

export interface SuccessMessageCriterion {
  selector: string;
  text?: string;
}

export interface SuccessResponseCriterion {
  urlPattern?: string;
  status?: number;
}

export interface SuccessConfig {
  message?: SuccessMessageCriterion;
  redirectUrl?: string;
  response?: SuccessResponseCriterion;
}

/**
 * A condition to wait on before proceeding — element appearing/disappearing,
 * a field's value reaching a particular state, or a fixed delay. Covers
 * cases the automatic per-field visibility wait doesn't: an unrelated
 * loading indicator, a value populated by another field's change handler,
 * or content that genuinely just needs a moment to settle.
 */
export type WaitCondition =
  | { type: "selector"; selector: string; state?: "visible" | "attached" | "hidden" | "detached" }
  | { type: "value"; selector: string; equals?: string; notEmpty?: boolean }
  | { type: "timeout"; ms: number };

export interface CrossFieldValidationCase {
  /** Descriptive name for this scenario, e.g. "password-confirm-mismatch". */
  name: string;
  /** Field name -> value overrides for just this case; every other field uses its validValue. */
  overrides: Record<string, string>;
  expectedError: string;
}

export interface FormConfig {
  /** Identifier for this form, used in reports and CLI output. */
  name: string;
  /** URL of the hosted form. */
  url: string;
  /** Selector for the control that submits the form. */
  submitSelector: string;
  fields: FieldConfig[];
  success: SuccessConfig;
  /** Optional scenarios spanning multiple fields (e.g. password/confirm mismatch, end-date before start-date). */
  crossFieldValidation?: CrossFieldValidationCase[];
  /** Optional selectors to snapshot (matched/visible/text) on the submission result, for post-hoc inspection. */
  snapshotSelectors?: string[];
  /** Optional conditions waited on, in order, after navigation and before any field is filled. */
  waits?: WaitCondition[];
}

export interface FormStep {
  /** Logical name for this step, used in reports. */
  name: string;
  /** Selector that is visible only while this step is the active one — used both to confirm arrival and, on a blocked advance attempt, to confirm we're still on this step. */
  stepMarkerSelector: string;
  fields: FieldConfig[];
  /** Selector for this step's "Next" control (the last step's acts as the real submit). */
  nextSelector: string;
  /** Optional scenarios spanning multiple fields within this step. */
  crossFieldValidation?: CrossFieldValidationCase[];
  /** Optional conditions waited on, in order, before this step's fields are filled — for content still settling after arriving on this step. */
  waits?: WaitCondition[];
}

export interface MultiStepFormConfig {
  /** Identifier for this form, used in reports and CLI output. */
  name: string;
  /** URL to navigate to before starting the wizard. */
  url: string;
  /** Optional selector clicked once after navigation to open the dialog/modal containing the wizard. */
  openTrigger?: string;
  /** Optional selector waited on (visible) to confirm the dialog opened, before touching the first step's fields. */
  dialogSelector?: string;
  steps: FormStep[];
  /** Success criteria checked after the last step's nextSelector is clicked. */
  success: SuccessConfig;
  /** Optional selectors to snapshot (matched/visible/text) on the final submission result. */
  snapshotSelectors?: string[];
}
