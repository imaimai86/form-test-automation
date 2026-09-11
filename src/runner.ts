import type { Page } from "playwright";
import { FieldConfig, FormConfig } from "./types";
import { closeSession, openFormPage, OpenFormPageOptions } from "./browser";
import { fillField } from "./fields";
import { FormTestAutomationError } from "./errors";

export type ValidationCaseStatus = "passed" | "failed" | "skipped";

export interface ValidationCaseResult {
  fieldName: string;
  /** The value submitted for this field in the case ("" for a required-empty case). */
  value: string;
  expectedError: string;
  status: ValidationCaseStatus;
  message: string;
}

/** Fills every field in the config with its valid value, except the one named `skipFieldName`. */
async function fillFormFieldsSkipping(
  page: Page,
  config: FormConfig,
  skipFieldName: string,
  timeoutMs: number | undefined
): Promise<void> {
  for (const field of config.fields) {
    if (field.name === skipFieldName) continue;
    await fillField(page, field, field.validValue, timeoutMs);
  }
}

async function assertErrorAppears(
  page: Page,
  field: FieldConfig,
  value: string,
  expectedError: string,
  timeoutMs: number
): Promise<ValidationCaseResult> {
  try {
    await page.locator(expectedError).waitFor({ state: "visible", timeout: timeoutMs });
    return {
      fieldName: field.name,
      value,
      expectedError,
      status: "passed",
      message: `Validation error appeared at "${expectedError}" as expected`,
    };
  } catch {
    return {
      fieldName: field.name,
      value,
      expectedError,
      status: "failed",
      message: `Expected validation error at "${expectedError}" did not appear within ${timeoutMs}ms`,
    };
  }
}

/**
 * For each field marked `required: true`, submits the form with that field
 * left empty (every other field filled with its valid value) and asserts
 * the field's configured empty-value error appears.
 *
 * A required field whose config has no `invalidValues` entry with
 * `value: ""` is reported with status "skipped" rather than "failed" —
 * that's a gap in the form config (nothing to verify against), not a
 * tool crash or a false test failure. See docs/requirements.md, "Graceful
 * failure, never a crash".
 */
export async function runRequiredFieldValidation(
  config: FormConfig,
  options: OpenFormPageOptions & { timeoutMs?: number } = {}
): Promise<ValidationCaseResult[]> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const results: ValidationCaseResult[] = [];
  const requiredFields = config.fields.filter((field) => field.required);

  for (const field of requiredFields) {
    const emptyCase = field.invalidValues?.find((iv) => iv.value === "");
    if (!emptyCase) {
      results.push({
        fieldName: field.name,
        value: "",
        expectedError: "",
        status: "skipped",
        message: `Field "${field.name}" is required but its config has no invalidValues entry with value "" to verify against`,
      });
      continue;
    }

    const session = await openFormPage(config.url, options);
    try {
      await fillFormFieldsSkipping(session.page, config, field.name, timeoutMs);
      await session.page.locator(config.submitSelector).click();
      results.push(await assertErrorAppears(session.page, field, "", emptyCase.expectedError, timeoutMs));
    } catch (err) {
      const reason = err instanceof FormTestAutomationError || err instanceof Error ? err.message : String(err);
      results.push({
        fieldName: field.name,
        value: "",
        expectedError: emptyCase.expectedError,
        status: "failed",
        message: `Could not complete this test case: ${reason}`,
      });
    } finally {
      await closeSession(session);
    }
  }

  return results;
}
