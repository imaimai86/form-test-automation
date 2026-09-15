import type { Page } from "playwright";

export interface ElementState {
  /** Whether the selector matched any element. */
  matched: boolean;
  /** Whether the first matched element is currently visible. False if unmatched. */
  visible: boolean;
  /** Trimmed text content of the first matched element. Empty string if unmatched. */
  text: string;
}

/**
 * Reads a single selector's current state on the page: whether it matched
 * anything, whether it's visible, and its text content. Never throws for a
 * selector that doesn't match — an absent element is a valid, inspectable
 * state (`matched: false`), not an error.
 *
 * Useful mid-flow, not just at final submission — e.g. inside a custom
 * `validate` hook (see SubmissionValidator), to check that some element
 * (not necessarily the one just filled) reflects an expected value: a
 * preview/summary field, a computed total, a counter that should have
 * incremented, etc.
 */
export async function inspectElement(page: Page, selector: string): Promise<ElementState> {
  const locator = page.locator(selector);
  const matched = (await locator.count()) > 0;
  const visible = matched ? await locator.first().isVisible().catch(() => false) : false;
  const text = matched ? ((await locator.first().textContent().catch(() => "")) ?? "").trim() : "";
  return { matched, visible, text };
}

/** Batch form of inspectElement, keyed by selector. */
export async function inspectElements(page: Page, selectors: string[]): Promise<Record<string, ElementState>> {
  const result: Record<string, ElementState> = {};
  for (const selector of selectors) {
    result[selector] = await inspectElement(page, selector);
  }
  return result;
}
