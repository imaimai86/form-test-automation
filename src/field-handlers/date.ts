import type { Page } from "playwright";
import { FieldConfig } from "../types";

/**
 * Fills a native `<input type="date">` element.
 *
 * `value` must be an ISO `"YYYY-MM-DD"` string (e.g. `"1990-05-15"`) — config
 * authors must supply dates in this format, since that is what native date
 * inputs accept via Playwright's `.fill()`.
 *
 * A malformed value (e.g. `"not-a-date"`) is a browser-level concern: the
 * browser will simply leave the field empty or reject the fill rather than
 * throwing, so no special-case handling is needed here.
 */
export async function fillDateField(page: Page, field: FieldConfig, value: string, timeoutMs: number): Promise<void> {
  const locator = page.locator(field.selector);
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
  await locator.fill(value);
}
