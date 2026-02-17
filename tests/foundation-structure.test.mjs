import assert from "node:assert/strict";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

const requiredPaths = [
  "src/app/layout.tsx",
  "src/app/page.tsx",
  "src/app/globals.css",
  "src/features/division-engine/index.ts",
  "src/features/workspace-ui/index.ts",
  "src/features/rewards/index.ts",
  "src/features/gallery/index.ts",
  "src/features/persistence/index.ts",
  "src/features/registry.ts",
];

for (const relativePath of requiredPaths) {
  test(`foundation path exists: ${relativePath}`, async () => {
    await assert.doesNotReject(
      access(path.join(repoRoot, relativePath), constants.F_OK),
      `${relativePath} should exist`,
    );
  });
}
