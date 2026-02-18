import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function readRepoFile(relativePath) {
  return readFile(path.join(repoRoot, relativePath), "utf8");
}

test("home live problem generation enforces 4-digit exact division with divisor 3-12", async () => {
  const source = await readRepoFile("src/app/page.tsx");

  for (const fragment of [
    "const LIVE_PROBLEM_MIN_DIVISOR = 3;",
    "const LIVE_PROBLEM_MAX_DIVISOR = 12;",
    "const LIVE_PROBLEM_DIVIDEND_DIGITS = 4;",
    'remainderMode: "forbid"',
    "getDigitCount(candidate.dividend) === LIVE_PROBLEM_DIVIDEND_DIGITS",
  ]) {
    assert.ok(source.includes(fragment), `Expected live-problem constraint fragment: ${fragment}`);
  }
});
