import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

function toDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function transpileTypeScriptToDataUrl(relativePath, replacements = {}) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");

  let compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;

  for (const [specifier, replacement] of Object.entries(replacements)) {
    compiled = compiled.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
    compiled = compiled.replaceAll(`from '${specifier}'`, `from "${replacement}"`);
  }

  return toDataUrl(compiled);
}

async function loadSqlitePlayerProfilesModule() {
  const localProfilesModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/persistence/lib/local-player-profiles.ts",
  );
  const sqliteProfilesModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/persistence/lib/sqlite-player-profiles.ts",
    {
      "./local-player-profiles": localProfilesModuleUrl,
    },
  );

  return import(sqliteProfilesModuleUrl);
}

const sqliteProfilesModulePromise = loadSqlitePlayerProfilesModule();

test("sqlite player profile storage uses repo-root .sqlite directory", async () => {
  const { getPlayerProfilesDatabaseLocation } = await sqliteProfilesModulePromise;
  const location = getPlayerProfilesDatabaseLocation();

  assert.ok(location.sqliteDirectory.endsWith(`${path.sep}.sqlite`));
  assert.ok(
    location.databasePath.endsWith(
      `${path.sep}.sqlite${path.sep}division-challenge.sqlite3`,
    ),
  );
});

test("writePlayerProfileSnapshotToSqlite and readPlayerProfileSnapshotFromSqlite round-trip snapshots", async () => {
  const {
    readPlayerProfileSnapshotFromSqlite,
    writePlayerProfileSnapshotToSqlite,
  } = await sqliteProfilesModulePromise;
  const playerName = `Gus Sqlite ${Date.now()}`;
  const snapshot = {
    gameSession: {
      amberBalance: 73,
      totalProblemsSolved: 12,
    },
    activeRewardReveal: {
      dinosaurName: "Velociraptor",
      milestoneSolvedCount: 10,
      initialStatus: "ready",
      initialImagePath: "/rewards/velociraptor.png",
    },
  };

  const persistedRecord = await writePlayerProfileSnapshotToSqlite({
    playerName,
    snapshot,
    updatedAtMs: Date.now(),
  });
  assert.equal(persistedRecord.playerName, playerName);
  assert.deepEqual(persistedRecord.snapshot, snapshot);

  const loadedRecord = await readPlayerProfileSnapshotFromSqlite(playerName);
  assert.ok(loadedRecord);
  assert.equal(loadedRecord?.playerName, playerName);
  assert.deepEqual(loadedRecord?.snapshot, snapshot);
});

test("stale writes do not overwrite newer sqlite player profile snapshots", async () => {
  const {
    readPlayerProfileSnapshotFromSqlite,
    writePlayerProfileSnapshotToSqlite,
  } = await sqliteProfilesModulePromise;
  const playerName = `Gus Stale ${Date.now()}`;
  const firstUpdatedAtMs = Date.now();
  const newerSnapshot = { amberBalance: 90 };
  const staleSnapshot = { amberBalance: 4 };

  await writePlayerProfileSnapshotToSqlite({
    playerName,
    snapshot: newerSnapshot,
    updatedAtMs: firstUpdatedAtMs,
  });
  await writePlayerProfileSnapshotToSqlite({
    playerName,
    snapshot: staleSnapshot,
    updatedAtMs: firstUpdatedAtMs - 10_000,
  });

  const loadedRecord = await readPlayerProfileSnapshotFromSqlite(playerName);
  assert.ok(loadedRecord);
  assert.deepEqual(loadedRecord?.snapshot, newerSnapshot);
});
