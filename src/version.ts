import * as fs from "node:fs";
import * as path from "node:path";

interface PackageJson {
  version: string;
}

/**
 * Reads this package's own version from its package.json at runtime,
 * walking upward from this file's directory until package.json is found.
 * Resolving by directory walk (rather than a hardcoded "../" count) means
 * this works correctly regardless of how deeply nested the compiled file
 * calling it is (dist/version.js vs dist/mcp/server.js, etc.) without each
 * caller needing its own relative-path guess — and, more importantly,
 * means the exported version can never drift out of sync with
 * package.json the way a hand-duplicated string literal would.
 */
function readPackageVersion(): string {
  let dir = __dirname;
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, "package.json");
    if (fs.existsSync(candidate)) {
      const pkg = JSON.parse(fs.readFileSync(candidate, "utf-8")) as PackageJson;
      return pkg.version;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "0.0.0";
}

export const VERSION = readPackageVersion();
