import type { Page, Response } from "playwright";
import { FieldConfig, FormConfig, SuccessMessageCriterion, SuccessResponseCriterion } from "./types";
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

export type SuccessCriterionKind = "message" | "redirectUrl" | "response";

export interface SuccessCheckResult {
  criterion: SuccessCriterionKind;
  passed: boolean;
  message: string;
}

export interface SubmissionResult {
  status: "passed" | "failed";
  checks: SuccessCheckResult[];
  message: string;
}

async function checkMessageCriterion(
  page: Page,
  criterion: SuccessMessageCriterion,
  timeoutMs: number
): Promise<SuccessCheckResult> {
  try {
    const locator = page.locator(criterion.selector);
    await locator.waitFor({ state: "visible", timeout: timeoutMs });
    if (criterion.text !== undefined) {
      const actualText = (await locator.textContent()) ?? "";
      if (!actualText.includes(criterion.text)) {
        return {
          criterion: "message",
          passed: false,
          message: `Success message at "${criterion.selector}" appeared but did not contain "${criterion.text}" (got "${actualText.trim()}")`,
        };
      }
    }
    return { criterion: "message", passed: true, message: `Success message at "${criterion.selector}" appeared as expected` };
  } catch {
    return {
      criterion: "message",
      passed: false,
      message: `Success message at "${criterion.selector}" did not appear within ${timeoutMs}ms`,
    };
  }
}

async function checkRedirectCriterion(page: Page, redirectUrl: string, timeoutMs: number): Promise<SuccessCheckResult> {
  try {
    await page.waitForURL(redirectUrl, { timeout: timeoutMs });
    return { criterion: "redirectUrl", passed: true, message: `Page redirected to "${redirectUrl}" as expected` };
  } catch {
    return {
      criterion: "redirectUrl",
      passed: false,
      message: `Page did not redirect to "${redirectUrl}" within ${timeoutMs}ms (current URL: "${page.url()}")`,
    };
  }
}

async function checkResponseCriterion(
  responsePromise: Promise<Response> | undefined,
  timeoutMs: number
): Promise<SuccessCheckResult> {
  if (!responsePromise) {
    return { criterion: "response", passed: false, message: "No matching network response was observed" };
  }
  try {
    const response = await responsePromise;
    return {
      criterion: "response",
      passed: true,
      message: `Matching network response observed (url="${response.url()}" status=${response.status()})`,
    };
  } catch {
    return {
      criterion: "response",
      passed: false,
      message: `No network response matching the configured criteria was observed within ${timeoutMs}ms`,
    };
  }
}

/**
 * Fills every field with its valid value, submits, and asserts every
 * success criterion configured on `config.success` (message, redirectUrl,
 * response — any combination, all of the ones present must pass). Returns
 * a single SubmissionResult with a per-criterion breakdown; never throws
 * for an expected outcome (a criterion not being met is a "failed" check,
 * not an exception).
 */
export async function runHappyPathSubmission(
  config: FormConfig,
  options: OpenFormPageOptions & { timeoutMs?: number } = {}
): Promise<SubmissionResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const session = await openFormPage(config.url, options);

  try {
    await fillFormFields(session.page, config, {}, new Set(), timeoutMs);

    let responsePromise: Promise<Response> | undefined;
    if (config.success.response) {
      const { urlPattern, status } = config.success.response;
      responsePromise = session.page.waitForResponse(
        (response) =>
          (urlPattern === undefined || response.url().includes(urlPattern)) &&
          (status === undefined || response.status() === status),
        { timeout: timeoutMs }
      );
      // Attach a no-op handler now so Node never reports this as an
      // unhandled rejection if it rejects before checkResponseCriterion
      // gets around to awaiting it below.
      responsePromise.catch(() => {});
    }

    await session.page.locator(config.submitSelector).click();

    const checks: SuccessCheckResult[] = [];
    if (config.success.message) {
      checks.push(await checkMessageCriterion(session.page, config.success.message, timeoutMs));
    }
    if (config.success.redirectUrl) {
      checks.push(await checkRedirectCriterion(session.page, config.success.redirectUrl, timeoutMs));
    }
    if (config.success.response) {
      checks.push(await checkResponseCriterion(responsePromise, timeoutMs));
    }

    const failedCount = checks.filter((c) => !c.passed).length;
    const allPassed = checks.length > 0 && failedCount === 0;
    return {
      status: allPassed ? "passed" : "failed",
      checks,
      message: allPassed
        ? "All configured success criteria were met"
        : `${failedCount} of ${checks.length} success criteria failed`,
    };
  } catch (err) {
    const reason = err instanceof FormTestAutomationError || err instanceof Error ? err.message : String(err);
    return {
      status: "failed",
      checks: [],
      message: `Could not complete the happy-path submission: ${reason}`,
    };
  } finally {
    await closeSession(session);
  }
}
