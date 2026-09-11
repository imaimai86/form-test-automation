/**
 * Base error for anything this package raises. Callers (and the CLI's
 * top-level catch) can rely on `instanceof FormTestAutomationError` to
 * distinguish expected, already-human-readable failures from truly
 * unexpected bugs. See docs/requirements.md, "Graceful failure, never a
 * crash".
 */
export class FormTestAutomationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormTestAutomationError";
  }
}

/** Raised for anything wrong with a form config: missing file, bad JSON, schema violations. */
export class ConfigError extends FormTestAutomationError {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}
