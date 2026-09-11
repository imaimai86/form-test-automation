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
  /** Navigation timeout in milliseconds, per attempt (default 30s). */
  timeoutMs?: number;
  /** Total navigation attempts before giving up (default 2, i.e. one retry). */
  retries?: number;
}

/**
 * Launches a browser and navigates to a form's URL, retrying on failure
 * (transient DNS hiccups and slow-loading pages against real hosted sites
 * are common) up to `retries` attempts with a short pause between. Only
 * after every attempt fails is the browser closed and a NavigationError
 * with the last failure's reason thrown — callers never see a raw
 * Playwright exception.
 */
export async function openFormPage(url: string, options: OpenFormPageOptions = {}): Promise<BrowserSession> {
  const headless = options.headless ?? true;
  const timeoutMs = options.timeoutMs ?? 30_000;
  const retries = options.retries ?? 2;

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();

  let lastError: unknown;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await page.goto(url, { timeout: timeoutMs, waitUntil: "domcontentloaded" });
      return { browser, page };
    } catch (err) {
      lastError = err;
      if (attempt < retries) {
        await page.waitForTimeout(500);
      }
    }
  }

  await browser.close();
  const reason = lastError instanceof Error ? lastError.message : String(lastError);
  throw new NavigationError(`Could not load form at "${url}" after ${retries} attempt(s): ${reason}`);
}

/** Closes the browser for a session opened with openFormPage. */
export async function closeSession(session: BrowserSession): Promise<void> {
  await session.browser.close();
}
