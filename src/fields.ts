import type { Page } from "playwright";
import { FieldConfig, FieldType } from "./types";
import { FormTestAutomationError } from "./errors";
import { fillSelectField } from "./field-handlers/select";
import { fillCheckboxField } from "./field-handlers/checkbox";
import { fillRadioField } from "./field-handlers/radio";
import { fillDateField } from "./field-handlers/date";
import { fillFileField } from "./field-handlers/file";

/** Raised when a field's selector never resolves to a visible element. */
export class FieldNotFoundError extends FormTestAutomationError {
  constructor(message: string) {
    super(message);
    this.name = "FieldNotFoundError";
  }
}

/** Raised when a field is found but filling it fails for another reason. */
export class FieldFillError extends FormTestAutomationError {
  constructor(message: string) {
    super(message);
    this.name = "FieldFillError";
  }
}

/**
 * A field handler knows how to fill one category of field type. Each field
 * type is registered independently in FIELD_FILLERS below, so new types plug
 * in without touching existing handlers.
 */
export type FieldFiller = (page: Page, field: FieldConfig, value: string, timeoutMs: number) => Promise<void>;

async function fillTextLike(page: Page, field: FieldConfig, value: string, timeoutMs: number): Promise<void> {
  const locator = page.locator(field.selector);
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
  await locator.fill(value);
}

const FIELD_FILLERS: Partial<Record<FieldType, FieldFiller>> = {
  text: fillTextLike,
  email: fillTextLike,
  phone: fillTextLike,
  password: fillTextLike,
  number: fillTextLike,
  textarea: fillTextLike,
  select: fillSelectField,
  checkbox: fillCheckboxField,
  radio: fillRadioField,
  date: fillDateField,
  file: fillFileField,
};

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Fills a single field on the current page with `value`. Unsupported field
 * types (not yet implemented) and selectors that never resolve both fail
 * with a specific FormTestAutomationError rather than an uncaught exception
 * or a silent no-op — see docs/requirements.md, "Graceful failure, never a
 * crash".
 */
export async function fillField(
  page: Page,
  field: FieldConfig,
  value: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<void> {
  const filler = FIELD_FILLERS[field.type];
  if (!filler) {
    throw new FieldFillError(`Field "${field.name}": filling type "${field.type}" is not implemented yet`);
  }

  try {
    await filler(page, field, value, timeoutMs);
  } catch (err) {
    if (err instanceof FormTestAutomationError) {
      throw err;
    }
    const reason = err instanceof Error ? err.message : String(err);
    if (reason.toLowerCase().includes("timeout")) {
      throw new FieldNotFoundError(
        `Field "${field.name}": selector "${field.selector}" was not visible within ${timeoutMs}ms`
      );
    }
    throw new FieldFillError(`Field "${field.name}" (selector "${field.selector}"): ${reason}`);
  }
}
