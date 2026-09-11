import type { Page } from "playwright";
import type { FieldConfig } from "../types";

/**
 * Fills a `<select>` element by choosing an option matching `value`.
 *
 * Config authors may reasonably write either the option's underlying
 * `value` attribute (e.g. "us") or its visible label text (e.g.
 * "United States") into `field.validValue` / invalid value cases. We try
 * matching by `value` first since that's the more common/precise case; if
 * no option has that `value` attribute, Playwright's `selectOption` throws,
 * and we fall back to matching by visible label text instead. Any other
 * error (e.g. the selector never resolves) propagates unchanged so the
 * caller (`fillField` in `../fields`) can classify it.
 */
export async function fillSelectField(page: Page, field: FieldConfig, value: string, timeoutMs: number): Promise<void> {
  const locator = page.locator(field.selector);
  await locator.waitFor({ state: "visible", timeout: timeoutMs });

  try {
    await locator.selectOption({ value });
  } catch {
    await locator.selectOption({ label: value });
  }
}
