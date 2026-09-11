import type { Page } from "playwright";
import { WaitCondition } from "./types";

/**
 * Executes a list of wait conditions in order against the page. Used before
 * interacting with a form/step whose content may still be settling: a
 * freshly-inserted step (AJAX-loaded), a value populated by another field's
 * change handler, an unrelated loading indicator, or simply a fixed delay.
 * Any unmet condition surfaces as a normal thrown error, caught by the
 * caller's existing try/catch alongside every other expected failure mode.
 */
export async function performWaits(page: Page, waits: WaitCondition[] | undefined, timeoutMs: number): Promise<void> {
  for (const wait of waits ?? []) {
    switch (wait.type) {
      case "selector": {
        const state = wait.state ?? "visible";
        await page.locator(wait.selector).waitFor({ state, timeout: timeoutMs });
        break;
      }
      case "value": {
        await page.waitForFunction(
          ({ selector, equals, notEmpty }) => {
            const el = document.querySelector(selector) as (HTMLInputElement | HTMLElement) | null;
            if (!el) return false;
            const value = "value" in el ? (el as HTMLInputElement).value : (el.textContent ?? "");
            if (equals !== undefined) return value === equals;
            if (notEmpty) return value.trim().length > 0;
            return true;
          },
          { selector: wait.selector, equals: wait.equals, notEmpty: wait.notEmpty },
          { timeout: timeoutMs }
        );
        break;
      }
      case "timeout": {
        await page.waitForTimeout(wait.ms);
        break;
      }
    }
  }
}
