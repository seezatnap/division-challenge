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

test("game-start panel prompts for player name and provides both start options", async () => {
  const componentSource = await readRepoFile("src/features/persistence/components/game-start-flow-panel.tsx");
  const flowSource = await readRepoFile("src/features/persistence/lib/game-start-flow.ts");

  for (const fragment of [
    "Player Name",
    "buildGameStartOptions",
    "createInMemoryGameSession",
    "loadSaveFromJsonFile",
    "exportSessionToJsonDownload",
    "supportsJsonSaveImportExportFallback",
  ]) {
    assert.ok(componentSource.includes(fragment), `Expected game-start fragment: ${fragment}`);
  }

  for (const fragment of ['label: "Start New"', 'label: "Load Existing Save"']) {
    assert.ok(flowSource.includes(fragment), `Expected start-option label: ${fragment}`);
  }
});

test("home page wires the game-start panel into the save/load surface", async () => {
  const pageSource = await readRepoFile("src/app/page.tsx");

  assert.ok(
    pageSource.includes("<GameStartFlowPanel loadableSave={loadableSavePreview} />"),
    "Expected save/load surface to render the game-start panel",
  );
});
