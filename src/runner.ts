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

/**
 * Fills every field in the config with its valid value, except:
 * - fields named in `skip` are left untouched (their natural empty/unset state)
 * - fields present in `overrides` are filled with the override value instead of their valid value
 * A field name should not appear in both `skip` and `overrides`.
 */
async function fillFormFields(
  page: Page,
  config: FormConfig,
  overrides: Record<string, string>,
  skip: Set<string>,
  timeoutMs: number | undefined
): Promise<void> {
  for (const field of config.fields) {
    if (skip.has(field.name)) continue;
    const value = field.name in overrides ? overrides[field.name] : field.validValue;
    await fillField(page, field, value, timeoutMs);
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
      await fillFormFields(session.page, config, {}, new Set([field.name]), timeoutMs);
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

/**
 * For each field's `invalidValues` entries with a non-empty value (bad
 * format, length violations, pattern mismatch, etc.), submits the form with
 * that field set to the invalid value (every other field filled with its
 * valid value) and asserts the case's configured error appears.
 *
 * A field with no non-empty `invalidValues` entries is reported with a
 * single "skipped" result — nothing to test, not a failure. See
 * docs/requirements.md, "Graceful failure, never a crash".
 */
export async function runFieldFormatValidation(
  config: FormConfig,
  options: OpenFormPageOptions & { timeoutMs?: number } = {}
): Promise<ValidationCaseResult[]> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const results: ValidationCaseResult[] = [];

  for (const field of config.fields) {
    const formatCases = (field.invalidValues ?? []).filter((iv) => iv.value !== "");
    if (formatCases.length === 0) {
      results.push({
        fieldName: field.name,
        value: "",
        expectedError: "",
        status: "skipped",
        message: `Field "${field.name}" has no non-empty invalidValues entries to test format/pattern validation against`,
      });
      continue;
    }

    for (const invalidCase of formatCases) {
      const session = await openFormPage(config.url, options);
      try {
        await fillFormFields(session.page, config, { [field.name]: invalidCase.value }, new Set(), timeoutMs);
        await session.page.locator(config.submitSelector).click();
        results.push(await assertErrorAppears(session.page, field, invalidCase.value, invalidCase.expectedError, timeoutMs));
      } catch (err) {
        const reason = err instanceof FormTestAutomationError || err instanceof Error ? err.message : String(err);
        results.push({
          fieldName: field.name,
          value: invalidCase.value,
          expectedError: invalidCase.expectedError,
          status: "failed",
          message: `Could not complete this test case: ${reason}`,
        });
      } finally {
        await closeSession(session);
      }
    }
  }

  return results;
}
