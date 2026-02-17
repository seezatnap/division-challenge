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

test("home page requires player name to start and wires localStorage profile persistence", async () => {
  const pageSource = await readRepoFile("src/app/page.tsx");

  for (const fragment of [
    'data-ui-surface="player-start"',
    'data-ui-action="start-session"',
    "Player Name",
    "Profiles are auto-saved in this browser by lowercase player name.",
    "normalizePlayerProfileName",
    "readPlayerProfileSnapshot",
    "writePlayerProfileSnapshot",
    "window.localStorage",
  ]) {
    assert.ok(pageSource.includes(fragment), `Expected player-start fragment: ${fragment}`);
  }

  assert.ok(
    pageSource.includes('required'),
    "Expected player-name input to require a non-empty value",
  );
  assert.equal(
    pageSource.includes("Expedition Files"),
    false,
    "Expedition Files save/load surface should be removed",
  );
});
