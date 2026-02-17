import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function loadTypeScriptModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const localProfilesModule = loadTypeScriptModule(
  "src/features/persistence/lib/local-player-profiles.ts",
);

test("normalizePlayerProfileName trims whitespace and rejects empty names", async () => {
  const { normalizePlayerProfileName } = await localProfilesModule;

  assert.equal(normalizePlayerProfileName("  Gus   Rex  "), "Gus Rex");
  assert.throws(() => normalizePlayerProfileName("   "), /Player name is required/);
});

test("toPlayerProfileStorageKey lowercases normalized player names", async () => {
  const { toPlayerProfileStorageKey } = await localProfilesModule;

  assert.equal(
    toPlayerProfileStorageKey("  Gus   Rex "),
    "dna-division-sequencer:player:gus rex",
  );
  assert.equal(toPlayerProfileStorageKey("gus rex"), toPlayerProfileStorageKey("GUS REX"));
});

test("writePlayerProfileSnapshot and readPlayerProfileSnapshot round-trip profile snapshots", async () => {
  const { readPlayerProfileSnapshot, writePlayerProfileSnapshot } = await localProfilesModule;
  const storageMap = new Map();
  const storage = {
    getItem(key) {
      return storageMap.has(key) ? storageMap.get(key) : null;
    },
    setItem(key, value) {
      storageMap.set(key, value);
    },
  };

  const snapshot = {
    gameSession: {
      totalProblemsSolved: 9,
    },
    activeRewardReveal: {
      dinosaurName: "Velociraptor",
    },
  };

  writePlayerProfileSnapshot(storage, "Gus", snapshot);

  const loadedEnvelope = readPlayerProfileSnapshot(storage, "gus");
  assert.ok(loadedEnvelope);
  assert.equal(loadedEnvelope?.playerName, "Gus");
  assert.deepEqual(loadedEnvelope?.snapshot, snapshot);
});

test("parsePlayerProfileEnvelope rejects malformed payloads", async () => {
  const { parsePlayerProfileEnvelope } = await localProfilesModule;

  assert.equal(parsePlayerProfileEnvelope(null), null);
  assert.equal(
    parsePlayerProfileEnvelope(JSON.stringify({ schemaVersion: 999, playerName: "Gus", snapshot: {} })),
    null,
  );
  assert.equal(
    parsePlayerProfileEnvelope(JSON.stringify({ schemaVersion: 1, snapshot: {} })),
    null,
  );
});
