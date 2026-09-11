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
}
