import type { Page } from "playwright";
import type { FieldConfig } from "../types";

/**
 * Fills a native `<input type="file">` field by setting its files to the
 * filesystem path given in `value` (absolute, or relative to the process's
 * CWD).
 *
 * Unlike `fillTextLike` (which waits for `state: "visible"`), file inputs
 * are very commonly visually hidden — styled via a custom label/button that
 * proxies clicks to the real input — while still fully interactable via
 * Playwright's `setInputFiles`, which does not require the element to be
 * visible. So we wait for `state: "attached"` instead, which only requires
 * the element to exist in the DOM.
 */
export async function fillFileField(page: Page, field: FieldConfig, value: string, timeoutMs: number): Promise<void> {
  const locator = page.locator(field.selector);
  await locator.waitFor({ state: "attached", timeout: timeoutMs });
  await locator.setInputFiles(value);
}
