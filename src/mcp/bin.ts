#!/usr/bin/env node

import { startMcpServer } from "./server";

// Last-resort safety net, matching src/cli.ts's convention: an expected
// failure should already be handled at the point it occurs; this only
// guards against something unexpected, so a crash still prints a clean
// message to stderr (stdout is reserved for the MCP protocol itself)
// instead of a raw stack trace.
startMcpServer().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`form-test-mcp: ${message}`);
  process.exitCode = 1;
});
