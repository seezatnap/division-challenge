import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createClient } from "@libsql/client";

import { loadTypeScriptModule } from "../scripts/lib/load-typescript-module.mjs";

// Simulates a database that was created before passwords existed: schema
// versions 1 and 2 applied, a couple of player profiles, no credentials table.
const databaseDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-auth-backfill-db-"));
const databasePath = path.join(databaseDirectory, "legacy.sqlite3");
process.env.TURSO_DATABASE_URL = `file:${databasePath}`;

const legacyClient = createClient({ url: `file:${databasePath}` });
await legacyClient.batch(
  [
    "CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at_ms INTEGER NOT NULL)",
    "INSERT INTO schema_migrations (version, applied_at_ms) VALUES (1, 1), (2, 2)",
    `
      CREATE TABLE player_profiles (
        player_name_key TEXT PRIMARY KEY,
        player_name TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL
      )
    `,
    {
      sql: "INSERT INTO player_profiles VALUES (?, ?, 1, ?, ?)",
      args: ["legacy gus", "Legacy Gus", JSON.stringify({ amber: 3 }), 1000],
    },
    {
      sql: "INSERT INTO player_profiles VALUES (?, ?, 1, ?, ?)",
      args: ["legacy ann", "Legacy Ann", JSON.stringify({ amber: 9 }), 2000],
    },
  ],
  "write",
);
legacyClient.close();

test("schema migration 3 backfills every pre-existing profile with the default password", async () => {
  const { getDatabase } = await loadTypeScriptModule("src/features/persistence/lib/database.ts");
  const { DEFAULT_LEGACY_PLAYER_PASSWORD, verifyPassword } = await loadTypeScriptModule(
    "src/features/persistence/lib/password-hashing.ts",
  );
  const { authenticatePlayer, readPlayerCredentials, isPlayerAuthError } =
    await loadTypeScriptModule("src/features/persistence/lib/sqlite-player-auth.ts");

  const client = await getDatabase();
  const versions = await client.execute("SELECT version FROM schema_migrations ORDER BY version");
  assert.deepEqual(
    versions.rows.map((row) => Number(row.version)),
    [1, 2, 3],
  );

  const gus = await readPlayerCredentials("Legacy Gus");
  const ann = await readPlayerCredentials("legacy ann");
  assert.ok(gus, "Legacy Gus received credentials");
  assert.ok(ann, "Legacy Ann received credentials");
  assert.equal(gus.playerName, "Legacy Gus");
  assert.equal(ann.playerName, "Legacy Ann");
  assert.notEqual(gus.passwordHash, ann.passwordHash, "each backfilled row gets its own salt");
  assert.equal(await verifyPassword(DEFAULT_LEGACY_PLAYER_PASSWORD, gus.passwordHash), true);
  assert.equal(await verifyPassword(DEFAULT_LEGACY_PLAYER_PASSWORD, ann.passwordHash), true);

  assert.equal(
    (await authenticatePlayer({ playerName: "Legacy Gus", password: DEFAULT_LEGACY_PLAYER_PASSWORD }))
      .playerName,
    "Legacy Gus",
  );
  await assert.rejects(
    authenticatePlayer({ playerName: "Legacy Ann", password: "something-else" }),
    (error) => isPlayerAuthError(error) && error.code === "invalid-password",
  );
});
