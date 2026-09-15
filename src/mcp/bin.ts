#!/usr/bin/env node

import { startMcpServer } from "./server";

// Optional override for verification/testing (e.g. exercising idle-session
// cleanup without waiting out the real default). Not part of the public
// config surface — undocumented on purpose.
const idleTimeoutOverride = process.env.HTML_AUTOMATION_MCP_IDLE_TIMEOUT_MS;
const idleTimeoutMs = idleTimeoutOverride ? Number(idleTimeoutOverride) : undefined;

// Last-resort safety net, matching src/cli.ts's convention: an expected
// failure should already be handled at the point it occurs; this only
// guards against something unexpected, so a crash still prints a clean
// message to stderr (stdout is reserved for the MCP protocol itself)
// instead of a raw stack trace.
startMcpServer({ idleTimeoutMs }).catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`html-automation-mcp: ${message}`);
  process.exitCode = 1;
});
