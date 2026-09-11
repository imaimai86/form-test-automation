import { chromium, Browser, Page } from "playwright";
import { FormTestAutomationError } from "./errors";

/** Raised when the browser can't load the form's URL at all. */
export class NavigationError extends FormTestAutomationError {
  constructor(message: string) {
    super(message);
    this.name = "NavigationError";
  }
}

export interface BrowserSession {
  browser: Browser;
  page: Page;
}

export interface OpenFormPageOptions {
  /** Run headless (default true). Set false for local debugging. */
  headless?: boolean;
  /** Navigation timeout in milliseconds (default 30s). */
  timeoutMs?: number;
}

/**
 * Launches a browser and navigates to a form's URL. On any navigation
 * failure (DNS, timeout, non-2xx response Playwright surfaces as an error,
 * etc.) the browser is closed and a NavigationError with a clear message is
 * thrown — callers never see a raw Playwright exception.
 */
export async function openFormPage(url: string, options: OpenFormPageOptions = {}): Promise<BrowserSession> {
  const headless = options.headless ?? true;
  const timeoutMs = options.timeoutMs ?? 30_000;

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();

  try {
    await page.goto(url, { timeout: timeoutMs, waitUntil: "domcontentloaded" });
  } catch (err) {
    await browser.close();
    const reason = err instanceof Error ? err.message : String(err);
    throw new NavigationError(`Could not load form at "${url}": ${reason}`);
  }

  return { browser, page };
}

/** Closes the browser for a session opened with openFormPage. */
export async function closeSession(session: BrowserSession): Promise<void> {
  await session.browser.close();
}
