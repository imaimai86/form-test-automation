#!/usr/bin/env node

/**
 * CLI entry point. Test-running logic lands in later increments
 * (config loading in increment 2, runner wiring in increment 8).
 */

function main(): void {
  const [, , configPath] = process.argv;

  if (!configPath) {
    console.error("Usage: fill-forms <config-file-or-directory>");
    process.exitCode = 1;
    return;
  }

  console.log(`form-test-automation: scaffold only, runner not implemented yet.`);
  console.log(`Would run against: ${configPath}`);
}

// Last-resort safety net: an expected failure (bad config, missing selector,
// network error, etc.) should already be caught and reported clearly at the
// point it happens by the runner/loader (see docs/requirements.md, "Graceful
// failure, never a crash"). This only guards against something unexpected
// slipping through, so users never see a raw stack trace.
try {
  main();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`form-test-automation: ${message}`);
  process.exitCode = 1;
}
