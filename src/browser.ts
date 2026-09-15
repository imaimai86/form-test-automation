import { chromium, Browser, Page } from "playwright";
import { FormTestAutomationError } from "./errors";
import { StorageState } from "./types";

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
  /** Reuse a previously-saved session (cookies + localStorage) instead of starting logged out. */
  storageState?: StorageState;
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

  let page: Page;
  try {
    // Our own StorageState type is intentionally looser than Playwright's own
    // (callers shouldn't need to import Playwright's internal cookie/origin
    // types just to pass this through) — Playwright validates the actual
    // shape at runtime, and a mismatch is caught below like any other
    // failure to start the session.
    const newPageOptions: Parameters<typeof browser.newPage>[0] = options.storageState
      ? { storageState: options.storageState as never }
      : {};
    page = await browser.newPage(newPageOptions);
  } catch (err) {
    await browser.close();
    const reason = err instanceof Error ? err.message : String(err);
    throw new NavigationError(`Could not start a browser session with the given storageState: ${reason}`);
  }

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
