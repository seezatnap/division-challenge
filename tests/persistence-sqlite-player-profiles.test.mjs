import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTypeScriptModule } from "../scripts/lib/load-typescript-module.mjs";

// Point this test file at its own database file so it never touches the
// developer's local data (the modules read the URL lazily on first query).
const databaseDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-player-profiles-db-"));
const databasePath = path.join(databaseDirectory, "profiles.sqlite3");
process.env.TURSO_DATABASE_URL = `file:${databasePath}`;

const sqliteProfilesModulePromise = loadTypeScriptModule(
  "src/features/persistence/lib/sqlite-player-profiles.ts",
);
const databaseModulePromise = loadTypeScriptModule("src/features/persistence/lib/database.ts");

test("player profile storage defaults to the repo-root .sqlite file and honours TURSO_DATABASE_URL", async () => {
  const { getPlayerProfilesDatabaseLocation } = await sqliteProfilesModulePromise;
  const { resolveDatabaseConfig } = await databaseModulePromise;

  const location = getPlayerProfilesDatabaseLocation();
  assert.equal(location.driver, "local-file");
  assert.equal(location.databasePath, databasePath);

  const defaultConfig = resolveDatabaseConfig({});
  assert.ok(defaultConfig.sqliteDirectory.endsWith(`${path.sep}.sqlite`));
  assert.ok(
    defaultConfig.databasePath.endsWith(
      `${path.sep}.sqlite${path.sep}division-challenge.sqlite3`,
    ),
  );

  const tursoConfig = resolveDatabaseConfig({
    TURSO_DATABASE_URL: "libsql://dino-division.turso.io",
    TURSO_AUTH_TOKEN: "token",
  });
  assert.equal(tursoConfig.driver, "turso");
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
