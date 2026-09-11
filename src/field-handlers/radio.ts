import type { Page } from "playwright";
import { FieldConfig } from "../types";

/**
 * Fills a radio field. In this schema, `field.selector` targets the exact
 * `<input type="radio">` option the config author wants selected (not a
 * group container), so filling it means checking that specific input.
 *
 * `value` is accepted only for interface compatibility with `FieldFiller`
 * and is intentionally unused: a native HTML radio input cannot be
 * individually unchecked, only deselected by checking a sibling input that
 * shares its `name` group. So there is no "uncheck" branch to decide on —
 * we unconditionally check the targeted option.
 */
export async function fillRadioField(page: Page, field: FieldConfig, value: string, timeoutMs: number): Promise<void> {
  const locator = page.locator(field.selector);
  await locator.waitFor({ state: "visible", timeout: timeoutMs });
  await locator.check();
}
