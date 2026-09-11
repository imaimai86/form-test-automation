import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigError } from "./errors";
import { CrossFieldValidationCase, FieldConfig, FieldType, FormConfig, InvalidValueCase, SuccessConfig } from "./types";

const VALID_FIELD_TYPES: readonly FieldType[] = [
  "text",
  "email",
  "phone",
  "password",
  "number",
  "select",
  "checkbox",
  "radio",
  "textarea",
  "date",
  "file",
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(obj: Record<string, unknown>, key: string, context: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ConfigError(`${context}: missing or empty required field "${key}"`);
  }
  return value;
}

function requireNumber(obj: Record<string, unknown>, key: string, context: string): number {
  const value = obj[key];
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ConfigError(`${context}: "${key}" must be a number`);
  }
  return value;
}

function validateInvalidValue(raw: unknown, index: number, context: string): InvalidValueCase {
  const caseContext = `${context}.invalidValues[${index}]`;
  if (!isPlainObject(raw)) {
    throw new ConfigError(`${caseContext}: expected an object`);
  }
  if (typeof raw.value !== "string") {
    throw new ConfigError(`${caseContext}: "value" must be a string`);
  }
  const expectedError = requireString(raw, "expectedError", caseContext);
  return { value: raw.value, expectedError };
}

function validateField(raw: unknown, index: number, context: string): FieldConfig {
  const fieldContext = `${context}.fields[${index}]`;
  if (!isPlainObject(raw)) {
    throw new ConfigError(`${fieldContext}: expected an object`);
  }

  const name = requireString(raw, "name", fieldContext);
  const namedContext = `${fieldContext} ("${name}")`;
  const selector = requireString(raw, "selector", namedContext);
  const typeValue = requireString(raw, "type", namedContext);
  if (!VALID_FIELD_TYPES.includes(typeValue as FieldType)) {
    throw new ConfigError(
      `${namedContext}: invalid "type" "${typeValue}" — must be one of ${VALID_FIELD_TYPES.join(", ")}`
    );
  }
  const validValue = requireString(raw, "validValue", namedContext);

  const field: FieldConfig = {
    name,
    selector,
    type: typeValue as FieldType,
    validValue,
  };

  if (raw.required !== undefined) {
    if (typeof raw.required !== "boolean") {
      throw new ConfigError(`${namedContext}: "required" must be a boolean`);
    }
    field.required = raw.required;
  }

  if (raw.invalidValues !== undefined) {
    if (!Array.isArray(raw.invalidValues)) {
      throw new ConfigError(`${namedContext}: "invalidValues" must be an array`);
    }
    field.invalidValues = raw.invalidValues.map((iv, i) => validateInvalidValue(iv, i, namedContext));
  }

  for (const key of ["minLength", "maxLength", "min", "max"] as const) {
    if (raw[key] !== undefined) {
      field[key] = requireNumber(raw, key, namedContext);
    }
  }

  if (raw.pattern !== undefined) {
    if (typeof raw.pattern !== "string") {
      throw new ConfigError(`${namedContext}: "pattern" must be a string`);
    }
    field.pattern = raw.pattern;
  }

  return field;
}

function validateSuccess(raw: unknown, context: string): SuccessConfig {
  const successContext = `${context}.success`;
  if (!isPlainObject(raw)) {
    throw new ConfigError(`${successContext}: must be an object`);
  }

  const success: SuccessConfig = {};

  if (raw.message !== undefined) {
    if (!isPlainObject(raw.message)) {
      throw new ConfigError(`${successContext}.message: must be an object`);
    }
    const selector = requireString(raw.message, "selector", `${successContext}.message`);
    const text = raw.message.text;
    if (text !== undefined && typeof text !== "string") {
      throw new ConfigError(`${successContext}.message: "text" must be a string`);
    }
    success.message = { selector, text };
  }

  if (raw.redirectUrl !== undefined) {
    if (typeof raw.redirectUrl !== "string") {
      throw new ConfigError(`${successContext}: "redirectUrl" must be a string`);
    }
    success.redirectUrl = raw.redirectUrl;
  }

  if (raw.response !== undefined) {
    if (!isPlainObject(raw.response)) {
      throw new ConfigError(`${successContext}.response: must be an object`);
    }
    const urlPattern = raw.response.urlPattern;
    const status = raw.response.status;
    if (urlPattern !== undefined && typeof urlPattern !== "string") {
      throw new ConfigError(`${successContext}.response: "urlPattern" must be a string`);
    }
    if (status !== undefined && typeof status !== "number") {
      throw new ConfigError(`${successContext}.response: "status" must be a number`);
    }
    success.response = { urlPattern, status };
  }

  if (!success.message && !success.redirectUrl && !success.response) {
    throw new ConfigError(
      `${successContext}: must specify at least one of "message", "redirectUrl", or "response"`
    );
  }

  return success;
}

/**
 * Validates a parsed JSON value against the form config schema, throwing a
 * ConfigError with a precise, human-readable location for the first problem
 * found. `sourceLabel` (typically the file path) is used to make errors
 * traceable back to their source.
 */
export function validateFormConfig(data: unknown, sourceLabel: string): FormConfig {
  if (!isPlainObject(data)) {
    throw new ConfigError(`${sourceLabel}: expected a JSON object at the top level`);
  }

  const name = requireString(data, "name", sourceLabel);
  const context = `${sourceLabel} ("${name}")`;

  const url = requireString(data, "url", context);
  try {
    new URL(url);
  } catch {
    throw new ConfigError(`${context}: "url" is not a valid URL: "${url}"`);
  }

  const submitSelector = requireString(data, "submitSelector", context);

  const rawFields = data.fields;
  if (!Array.isArray(rawFields) || rawFields.length === 0) {
    throw new ConfigError(`${context}: "fields" must be a non-empty array`);
  }
  const fields = rawFields.map((f, i) => validateField(f, i, context));

  const success = validateSuccess(data.success, context);

  const fieldNames = new Set(fields.map((f) => f.name));
  const crossFieldValidation =
    data.crossFieldValidation !== undefined
      ? validateCrossFieldValidation(data.crossFieldValidation, fieldNames, context)
      : undefined;

  return { name, url, submitSelector, fields, success, crossFieldValidation };
}

function validateCrossFieldValidation(
  raw: unknown,
  fieldNames: Set<string>,
  context: string
): CrossFieldValidationCase[] {
  if (!Array.isArray(raw)) {
    throw new ConfigError(`${context}: "crossFieldValidation" must be an array`);
  }
  return raw.map((entry, i) => {
    const caseContext = `${context}.crossFieldValidation[${i}]`;
    if (!isPlainObject(entry)) {
      throw new ConfigError(`${caseContext}: expected an object`);
    }
    const name = requireString(entry, "name", caseContext);
    const namedContext = `${caseContext} ("${name}")`;
    if (!isPlainObject(entry.overrides) || Object.keys(entry.overrides).length === 0) {
      throw new ConfigError(`${namedContext}: "overrides" must be a non-empty object of field name -> value`);
    }
    const overrides: Record<string, string> = {};
    for (const [fieldName, value] of Object.entries(entry.overrides)) {
      if (!fieldNames.has(fieldName)) {
        throw new ConfigError(`${namedContext}: "overrides" references unknown field "${fieldName}"`);
      }
      if (typeof value !== "string") {
        throw new ConfigError(`${namedContext}: "overrides.${fieldName}" must be a string`);
      }
      overrides[fieldName] = value;
    }
    const expectedError = requireString(entry, "expectedError", namedContext);
    return { name, overrides, expectedError };
  });
}

/** Loads and validates a single form config file. */
export function loadFormConfig(filePath: string): FormConfig {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new ConfigError(`Config file not found: ${filePath}`);
    }
    throw new ConfigError(`Could not read config file "${filePath}": ${(err as Error).message}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new ConfigError(`Config file "${filePath}" is not valid JSON: ${(err as Error).message}`);
  }

  return validateFormConfig(data, filePath);
}

/**
 * Loads all form configs from a path: a single config file, or every
 * `*.json` file in a directory (non-recursive, sorted for stable ordering).
 */
export function loadFormConfigs(target: string): FormConfig[] {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(target);
  } catch {
    throw new ConfigError(`Config path not found: ${target}`);
  }

  if (stat.isDirectory()) {
    const files = fs
      .readdirSync(target)
      .filter((f) => f.toLowerCase().endsWith(".json"))
      .sort();
    if (files.length === 0) {
      throw new ConfigError(`No .json config files found in directory: ${target}`);
    }
    return files.map((f) => loadFormConfig(path.join(target, f)));
  }

  return [loadFormConfig(target)];
}
