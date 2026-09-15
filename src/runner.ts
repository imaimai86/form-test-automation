import type { Page, Response } from "playwright";
import { FieldConfig, FormConfig, MultiStepFormConfig, SuccessConfig, SuccessMessageCriterion, SuccessResponseCriterion } from "./types";
import { closeSession, openFormPage, OpenFormPageOptions } from "./browser";
import { fillField } from "./fields";
import { FormTestAutomationError } from "./errors";
import { performWaits } from "./waits";
import { ElementState, inspectElements } from "./inspect";

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
 * Fills every field in `fields` with its valid value, except:
 * - fields named in `skip` are left untouched (their natural empty/unset state)
 * - fields present in `overrides` are filled with the override value instead of their valid value
 * A field name should not appear in both `skip` and `overrides`.
 *
 * Takes a bare FieldConfig[] (not a whole FormConfig) so it's reusable for a
 * single step of a multi-step form, not just a full single-step form.
 */
async function fillFormFields(
  page: Page,
  fields: FieldConfig[],
  overrides: Record<string, string>,
  skip: Set<string>,
  timeoutMs: number | undefined
): Promise<void> {
  for (const field of fields) {
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

    const session = await openFormPage(config.url, { storageState: config.storageState, ...options });
    try {
      await performWaits(session.page, config.waits, timeoutMs);
      await fillFormFields(session.page, config.fields, {}, new Set([field.name]), timeoutMs);
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
      const session = await openFormPage(config.url, { storageState: config.storageState, ...options });
      try {
        await performWaits(session.page, config.waits, timeoutMs);
        await fillFormFields(session.page, config.fields, { [field.name]: invalidCase.value }, new Set(), timeoutMs);
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

/**
 * For each scenario in `config.crossFieldValidation`, fills the form with
 * every field at its valid value except the ones named in the scenario's
 * `overrides` (e.g. a mismatched confirm-password field), submits, and
 * asserts the scenario's configured error appears. A config with no
 * `crossFieldValidation` scenarios is reported with a single "skipped"
 * result.
 */
export async function runCrossFieldValidation(
  config: FormConfig,
  options: OpenFormPageOptions & { timeoutMs?: number } = {}
): Promise<ValidationCaseResult[]> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const cases = config.crossFieldValidation ?? [];

  if (cases.length === 0) {
    return [
      {
        fieldName: "cross-field",
        value: "",
        expectedError: "",
        status: "skipped",
        message: 'This form has no "crossFieldValidation" scenarios configured to test',
      },
    ];
  }

  const results: ValidationCaseResult[] = [];
  for (const crossCase of cases) {
    const session = await openFormPage(config.url, { storageState: config.storageState, ...options });
    try {
      await performWaits(session.page, config.waits, timeoutMs);
      await fillFormFields(session.page, config.fields, crossCase.overrides, new Set(), timeoutMs);
      await session.page.locator(config.submitSelector).click();
      const overrideSummary = JSON.stringify(crossCase.overrides);
      try {
        await session.page.locator(crossCase.expectedError).waitFor({ state: "visible", timeout: timeoutMs });
        results.push({
          fieldName: crossCase.name,
          value: overrideSummary,
          expectedError: crossCase.expectedError,
          status: "passed",
          message: `Validation error appeared at "${crossCase.expectedError}" as expected`,
        });
      } catch {
        results.push({
          fieldName: crossCase.name,
          value: overrideSummary,
          expectedError: crossCase.expectedError,
          status: "failed",
          message: `Expected validation error at "${crossCase.expectedError}" did not appear within ${timeoutMs}ms`,
        });
      }
    } catch (err) {
      const reason = err instanceof FormTestAutomationError || err instanceof Error ? err.message : String(err);
      results.push({
        fieldName: crossCase.name,
        value: JSON.stringify(crossCase.overrides),
        expectedError: crossCase.expectedError,
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
 * Fills the form with valid values, clicks submit, then immediately clicks
 * it again (best-effort — the control may already be gone if the first
 * click navigated away, which is itself a sign the site prevented a second
 * submission). Passes if the form still reaches its normal single success
 * state afterward, rather than an error or inconsistent state.
 */
export async function runDoubleSubmitCheck(
  config: FormConfig,
  options: OpenFormPageOptions & { timeoutMs?: number } = {}
): Promise<ValidationCaseResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const session = await openFormPage(config.url, { storageState: config.storageState, ...options });
  try {
    await performWaits(session.page, config.waits, timeoutMs);
    await fillFormFields(session.page, config.fields, {}, new Set(), timeoutMs);
    const submitLocator = session.page.locator(config.submitSelector);
    await submitLocator.click();
    // Best-effort second click. If the page already navigated away, the
    // element may be detached/stale — that failure is itself evidence a
    // second submission couldn't happen, so it's swallowed, not reported.
    await submitLocator.click({ timeout: 1000 }).catch(() => {});

    const checks: boolean[] = [];
    if (config.success.redirectUrl) {
      checks.push(
        await session.page
          .waitForURL(config.success.redirectUrl, { timeout: timeoutMs })
          .then(() => true)
          .catch(() => false)
      );
    }
    if (config.success.message) {
      checks.push(
        await session.page
          .locator(config.success.message.selector)
          .waitFor({ state: "visible", timeout: timeoutMs })
          .then(() => true)
          .catch(() => false)
      );
    }

    const passed = checks.length > 0 && checks.every(Boolean);
    return {
      fieldName: "double-submit",
      value: "",
      expectedError: "",
      status: passed ? "passed" : "failed",
      message: passed
        ? "Clicking submit twice in quick succession still landed on the expected single success state"
        : "After double-clicking submit, the expected success state was not reached (possible duplicate-submission issue)",
    };
  } catch (err) {
    const reason = err instanceof FormTestAutomationError || err instanceof Error ? err.message : String(err);
    return {
      fieldName: "double-submit",
      value: "",
      expectedError: "",
      status: "failed",
      message: `Could not complete this test case: ${reason}`,
    };
  } finally {
    await closeSession(session);
  }
}

/**
 * Submits the form successfully, then navigates back with the browser's
 * back button, and asserts the page moves away from the post-submit URL
 * without error (rather than silently resubmitting or getting stuck).
 */
export async function runBackButtonCheck(
  config: FormConfig,
  options: OpenFormPageOptions & { timeoutMs?: number } = {}
): Promise<ValidationCaseResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const session = await openFormPage(config.url, { storageState: config.storageState, ...options });
  try {
    await performWaits(session.page, config.waits, timeoutMs);
    await fillFormFields(session.page, config.fields, {}, new Set(), timeoutMs);
    await session.page.locator(config.submitSelector).click();

    if (config.success.redirectUrl) {
      await session.page.waitForURL(config.success.redirectUrl, { timeout: timeoutMs }).catch(() => {});
    } else if (config.success.message) {
      await session.page
        .locator(config.success.message.selector)
        .waitFor({ state: "visible", timeout: timeoutMs })
        .catch(() => {});
    }

    const urlAfterSubmit = session.page.url();
    await session.page.goBack({ timeout: timeoutMs, waitUntil: "domcontentloaded" });
    const urlAfterBack = session.page.url();

    const passed = urlAfterBack !== urlAfterSubmit;
    return {
      fieldName: "back-button",
      value: "",
      expectedError: "",
      status: passed ? "passed" : "failed",
      message: passed
        ? `Browser back navigation moved away from the post-submit URL ("${urlAfterSubmit}" -> "${urlAfterBack}") without error`
        : `Browser back navigation did not change the URL away from "${urlAfterSubmit}" as expected`,
    };
  } catch (err) {
    const reason = err instanceof FormTestAutomationError || err instanceof Error ? err.message : String(err);
    return {
      fieldName: "back-button",
      value: "",
      expectedError: "",
      status: "failed",
      message: `Could not complete this test case: ${reason}`,
    };
  } finally {
    await closeSession(session);
  }
}

export type SuccessCriterionKind = "message" | "redirectUrl" | "response" | "custom";

export interface SuccessCheckResult {
  criterion: SuccessCriterionKind;
  passed: boolean;
  message: string;
}

/**
 * One selector's captured state at submission time: did it match anything,
 * was it visible, and its text. Same shape as `ElementState` from
 * `./inspect` — kept as its own exported name since it's part of the public
 * `SubmissionResult` shape.
 */
export type SnapshotEntry = ElementState;

export interface SubmissionResult {
  status: "passed" | "failed";
  checks: SuccessCheckResult[];
  message: string;
  /** Present only when snapshotSelectors was configured. Captured regardless of overall pass/fail. */
  snapshot?: Record<string, SnapshotEntry>;
}

/** A caller-supplied hook for success/failure logic beyond declarative success criteria (FR16). */
export type SubmissionValidator = (page: Page) => Promise<{ passed: boolean; message: string }>;

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

async function captureSnapshot(page: Page, selectors: string[] | undefined): Promise<Record<string, SnapshotEntry> | undefined> {
  if (!selectors || selectors.length === 0) return undefined;
  return inspectElements(page, selectors);
}

/**
 * Given a page ready to submit, arms any configured network-response
 * listener, performs `submitAction` (the actual click — a plain submit
 * button for a single-step form, or the last step's "next" control for a
 * wizard), then checks every configured success criterion plus, if
 * provided, a custom validate hook — all ANDed together — and captures a
 * DOM snapshot if `snapshotSelectors` was configured. Shared by
 * runHappyPathSubmission and runMultiStepHappyPath so success-checking
 * logic exists in exactly one place.
 */
async function submitAndCheckSuccess(
  page: Page,
  success: SuccessConfig,
  submitAction: () => Promise<void>,
  timeoutMs: number,
  extra: { snapshotSelectors?: string[]; validate?: SubmissionValidator }
): Promise<SubmissionResult> {
  let responsePromise: Promise<Response> | undefined;
  if (success.response) {
    const { urlPattern, status } = success.response;
    responsePromise = page.waitForResponse(
      (response) =>
        (urlPattern === undefined || response.url().includes(urlPattern)) &&
        (status === undefined || response.status() === status),
      { timeout: timeoutMs }
    );
    // Attach a no-op handler now so Node never reports this as an
    // unhandled rejection if it rejects before checkResponseCriterion gets
    // around to awaiting it below.
    responsePromise.catch(() => {});
  }

  await submitAction();

  const checks: SuccessCheckResult[] = [];
  if (success.message) {
    checks.push(await checkMessageCriterion(page, success.message, timeoutMs));
  }
  if (success.redirectUrl) {
    checks.push(await checkRedirectCriterion(page, success.redirectUrl, timeoutMs));
  }
  if (success.response) {
    checks.push(await checkResponseCriterion(responsePromise, timeoutMs));
  }
  if (extra.validate) {
    const result = await extra.validate(page);
    checks.push({ criterion: "custom", passed: result.passed, message: result.message });
  }

  const snapshot = await captureSnapshot(page, extra.snapshotSelectors);

  const failedCount = checks.filter((c) => !c.passed).length;
  const allPassed = checks.length > 0 && failedCount === 0;
  return {
    status: allPassed ? "passed" : "failed",
    checks,
    message: allPassed
      ? "All configured success criteria were met"
      : `${failedCount} of ${checks.length} success criteria failed`,
    snapshot,
  };
}

/**
 * Fills every field with its valid value, submits, and asserts every
 * success criterion configured on `config.success` (message, redirectUrl,
 * response — any combination, all of the ones present must pass), plus an
 * optional caller-supplied `validate` hook (FR16) and an optional DOM
 * snapshot of `config.snapshotSelectors` (FR15). Returns a single
 * SubmissionResult with a per-criterion breakdown; never throws for an
 * expected outcome (a criterion not being met is a "failed" check, not an
 * exception).
 */
export async function runHappyPathSubmission(
  config: FormConfig,
  options: OpenFormPageOptions & { timeoutMs?: number; validate?: SubmissionValidator } = {}
): Promise<SubmissionResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const session = await openFormPage(config.url, { storageState: config.storageState, ...options });

  try {
    await performWaits(session.page, config.waits, timeoutMs);
    await fillFormFields(session.page, config.fields, {}, new Set(), timeoutMs);

    return await submitAndCheckSuccess(
      session.page,
      config.success,
      () => session.page.locator(config.submitSelector).click(),
      timeoutMs,
      { snapshotSelectors: config.snapshotSelectors, validate: options.validate }
    );
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

/**
 * Opens the dialog (if `openTrigger`/`dialogSelector` are configured) and
 * advances through steps `[0, uptoStepIndex)` with valid data, leaving the
 * wizard positioned on step `uptoStepIndex`. Shared by
 * runMultiStepHappyPath (advances through every step but the last) and
 * runMultiStepStepValidation (advances to whichever step is under test).
 * Every expected failure (missing/wrong openTrigger, a step that never
 * advances) throws a plain Error with a specific message — callers already
 * wrap this in their own try/catch alongside every other expected failure.
 */
async function advanceThroughSteps(
  page: Page,
  config: MultiStepFormConfig,
  uptoStepIndex: number,
  timeoutMs: number
): Promise<void> {
  await performWaits(page, config.waits, timeoutMs);

  if (config.openTrigger) {
    try {
      await page.locator(config.openTrigger).click({ timeout: timeoutMs });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not open the dialog: clicking openTrigger "${config.openTrigger}" failed: ${reason}`);
    }
    if (config.dialogSelector) {
      try {
        await page.locator(config.dialogSelector).waitFor({ state: "visible", timeout: timeoutMs });
      } catch {
        throw new Error(
          `Dialog did not open: "${config.dialogSelector}" was not visible within ${timeoutMs}ms after clicking openTrigger`
        );
      }
    }
  }

  for (let i = 0; i < uptoStepIndex; i++) {
    const step = config.steps[i];
    await performWaits(page, step.waits, timeoutMs);
    await fillFormFields(page, step.fields, {}, new Set(), timeoutMs);
    await page.locator(step.nextSelector).click();
    const nextStep = config.steps[i + 1];
    try {
      await page.locator(nextStep.stepMarkerSelector).waitFor({ state: "visible", timeout: timeoutMs });
    } catch {
      throw new Error(
        `Step "${step.name}": clicked "${step.nextSelector}" but the next step's marker "${nextStep.stepMarkerSelector}" never became visible within ${timeoutMs}ms`
      );
    }
  }
}

/**
 * Runs a full multi-step wizard: optionally clicks `openTrigger` to open a
 * dialog (waiting for `dialogSelector` if configured), then for each step
 * fills its fields and clicks its `nextSelector` — waiting for the next
 * step's `stepMarkerSelector` to become visible before continuing, exactly
 * the same way whether that next step was already in the DOM (hidden) or
 * gets inserted dynamically (see docs/requirements.md, "Multi-Step Forms",
 * FR12). On the last step, reuses the same success-criteria/snapshot/
 * validate-hook logic as runHappyPathSubmission via submitAndCheckSuccess.
 * Every expected failure mode (a missing dialog trigger, a step that never
 * advances, a navigation error) produces a "failed" SubmissionResult with a
 * specific message, never an uncaught exception.
 */
export async function runMultiStepHappyPath(
  config: MultiStepFormConfig,
  options: OpenFormPageOptions & { timeoutMs?: number; validate?: SubmissionValidator } = {}
): Promise<SubmissionResult> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const session = await openFormPage(config.url, { storageState: config.storageState, ...options });

  try {
    if (config.steps.length === 0) {
      return { status: "failed", checks: [], message: "Multi-step config has no steps to run" };
    }

    await advanceThroughSteps(session.page, config, config.steps.length - 1, timeoutMs);

    const lastStep = config.steps[config.steps.length - 1];
    await performWaits(session.page, lastStep.waits, timeoutMs);
    await fillFormFields(session.page, lastStep.fields, {}, new Set(), timeoutMs);

    return await submitAndCheckSuccess(
      session.page,
      config.success,
      () => session.page.locator(lastStep.nextSelector).click(),
      timeoutMs,
      { snapshotSelectors: config.snapshotSelectors, validate: options.validate }
    );
  } catch (err) {
    const reason = err instanceof FormTestAutomationError || err instanceof Error ? err.message : String(err);
    return {
      status: "failed",
      checks: [],
      message: `Could not complete the multi-step happy-path submission: ${reason}`,
    };
  } finally {
    await closeSession(session);
  }
}

/**
 * For each step, for each field's `invalidValues` entries, fills that one
 * field with the invalid value (every other field in the same step filled
 * with its valid value), clicks the step's `nextSelector`, and asserts BOTH
 * that the field's configured error appears AND that the wizard did not
 * advance (the step's own marker is still visible, and — if not the last
 * step — the next step's marker never appeared). Reaching step N first
 * requires completing steps 0..N-1 with valid data, via the same
 * advanceThroughSteps helper runMultiStepHappyPath uses.
 *
 * A step field with no `invalidValues` entries contributes a single
 * "skipped" result, consistent with the equivalent single-step runners.
 * Result `fieldName` is qualified as "stepName.fieldName" since a field
 * name is only unique within its own step.
 */
export async function runMultiStepStepValidation(
  config: MultiStepFormConfig,
  options: OpenFormPageOptions & { timeoutMs?: number } = {}
): Promise<ValidationCaseResult[]> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const results: ValidationCaseResult[] = [];

  for (let stepIndex = 0; stepIndex < config.steps.length; stepIndex++) {
    const step = config.steps[stepIndex];
    const isLastStep = stepIndex === config.steps.length - 1;

    for (const field of step.fields) {
      const cases = field.invalidValues ?? [];
      const qualifiedName = `${step.name}.${field.name}`;

      if (cases.length === 0) {
        results.push({
          fieldName: qualifiedName,
          value: "",
          expectedError: "",
          status: "skipped",
          message: `Field "${field.name}" in step "${step.name}" has no invalidValues entries to test`,
        });
        continue;
      }

      for (const invalidCase of cases) {
        const session = await openFormPage(config.url, { storageState: config.storageState, ...options });
        try {
          await advanceThroughSteps(session.page, config, stepIndex, timeoutMs);
          await performWaits(session.page, step.waits, timeoutMs);
          await fillFormFields(session.page, step.fields, { [field.name]: invalidCase.value }, new Set(), timeoutMs);
          await session.page.locator(step.nextSelector).click();

          const errorAppeared = await session.page
            .locator(invalidCase.expectedError)
            .waitFor({ state: "visible", timeout: timeoutMs })
            .then(() => true)
            .catch(() => false);

          let stayedOnStep = await session.page
            .locator(step.stepMarkerSelector)
            .isVisible()
            .catch(() => false);
          if (stayedOnStep && !isLastStep) {
            const nextStep = config.steps[stepIndex + 1];
            const nextVisible = await session.page
              .locator(nextStep.stepMarkerSelector)
              .isVisible()
              .catch(() => false);
            stayedOnStep = !nextVisible;
          }

          const passed = errorAppeared && stayedOnStep;
          results.push({
            fieldName: qualifiedName,
            value: invalidCase.value,
            expectedError: invalidCase.expectedError,
            status: passed ? "passed" : "failed",
            message: passed
              ? `Validation error appeared at "${invalidCase.expectedError}" and the wizard correctly stayed on step "${step.name}"`
              : !errorAppeared
                ? `Expected validation error at "${invalidCase.expectedError}" did not appear within ${timeoutMs}ms`
                : `Validation error appeared, but the wizard advanced past step "${step.name}" anyway`,
          });
        } catch (err) {
          const reason = err instanceof FormTestAutomationError || err instanceof Error ? err.message : String(err);
          results.push({
            fieldName: qualifiedName,
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
  }

  return results;
}
