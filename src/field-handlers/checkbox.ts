import type { Page } from "playwright";
import { FieldConfig } from "../types";

const TRUTHY_VALUES = new Set(["true", "1", "yes", "on", "checked"]);
const FALSY_VALUES = new Set(["false", "0", "no", "off", "unchecked", ""]);

/**
 * Parses a checkbox field's string value into a boolean. Case-insensitive
 * and trimmed. Throws a plain Error for anything not recognized.
 */
function parseCheckboxValue(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (TRUTHY_VALUES.has(normalized)) {
    return true;
  }
  if (FALSY_VALUES.has(normalized)) {
    return false;
  }
  throw new Error(
    `Checkbox value "${value}" is not a recognized boolean (expected true/false, yes/no, 1/0, on/off, checked/unchecked)`
  );
}

/**
 * Field handler for checkbox inputs. Parses `value` into a boolean and
 * checks/unchecks the located element accordingly.
 */
export async function fillCheckboxField(
  page: Page,
  field: FieldConfig,
  value: string,
  timeoutMs: number
): Promise<void> {
  const shouldCheck = parseCheckboxValue(value);
  const locator = page.locator(field.selector);
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
  if (shouldCheck) {
    await locator.check();
  } else {
    await locator.uncheck();
  }
}
