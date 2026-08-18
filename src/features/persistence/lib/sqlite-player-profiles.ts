/**
 * Player profiles stored in the shared database (Turso in production, a local
 * SQLite file in development). See `./database` for connection resolution.
 */

import {
  executeDatabaseStatement,
  getDatabaseLocation,
  type DatabaseLocationSnapshot,
  type DatabaseRow,
} from "./database";
import {
  normalizePlayerProfileName,
  PLAYER_PROFILE_STORAGE_SCHEMA_VERSION,
  type PlayerProfileEnvelope,
} from "./local-player-profiles";

export type PlayerProfilesDatabaseLocationSnapshot = DatabaseLocationSnapshot;

export interface SqlitePlayerProfileRecord<TProfileSnapshot>
  extends PlayerProfileEnvelope<TProfileSnapshot> {
  playerNameKey: string;
  updatedAtMs: number;
}

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toNonNegativeInteger(value: unknown): number | null {
  const numericValue = typeof value === "bigint" ? Number(value) : value;
  if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
    return null;
  }

  return Math.max(0, Math.floor(numericValue));
}

export function getPlayerProfilesDatabaseLocation(): PlayerProfilesDatabaseLocationSnapshot {
  return getDatabaseLocation();
}

export function toPlayerNameKey(playerName: string): string {
  return normalizePlayerProfileName(playerName).toLowerCase();
}

function toSqlitePlayerProfileRecord<TProfileSnapshot>(
  row: DatabaseRow,
): SqlitePlayerProfileRecord<TProfileSnapshot> | null {
  const playerNameKey = getTrimmedNonEmptyString(row.player_name_key);
  const playerName = getTrimmedNonEmptyString(row.player_name);
  const snapshotJson = getTrimmedNonEmptyString(row.snapshot_json);
  const updatedAtMs = toNonNegativeInteger(row.updated_at_ms);

  if (!playerNameKey || !playerName || !snapshotJson || updatedAtMs === null) {
    return null;
  }

  if (Number(row.schema_version) !== PLAYER_PROFILE_STORAGE_SCHEMA_VERSION) {
    return null;
  }

  try {
    const snapshot = JSON.parse(snapshotJson) as TProfileSnapshot;
    return {
      schemaVersion: PLAYER_PROFILE_STORAGE_SCHEMA_VERSION,
      playerName,
      playerNameKey,
      snapshot,
      updatedAtMs,
    };
  } catch {
    return null;
  }
}

export async function readPlayerProfileSnapshotFromSqlite<TProfileSnapshot>(
  playerName: string,
): Promise<SqlitePlayerProfileRecord<TProfileSnapshot> | null> {
  const normalizedPlayerName = normalizePlayerProfileName(playerName);
  const result = await executeDatabaseStatement({
    sql: `
      SELECT
        player_name_key,
        player_name,
        schema_version,
        snapshot_json,
        updated_at_ms
      FROM player_profiles
      WHERE player_name_key = ?
      LIMIT 1
    `,
    args: [toPlayerNameKey(normalizedPlayerName)],
  });

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return toSqlitePlayerProfileRecord<TProfileSnapshot>(row);
}

export async function listPlayerProfileSnapshotsFromSqlite<TProfileSnapshot>(): Promise<
  readonly SqlitePlayerProfileRecord<TProfileSnapshot>[]
> {
  const result = await executeDatabaseStatement({
    sql: `
      SELECT
        player_name_key,
        player_name,
        schema_version,
        snapshot_json,
        updated_at_ms
      FROM player_profiles
      ORDER BY updated_at_ms DESC, player_name COLLATE NOCASE ASC
    `,
    args: [],
  });

  return result.rows
    .map((row) => toSqlitePlayerProfileRecord<TProfileSnapshot>(row))
    .filter(
      (record): record is SqlitePlayerProfileRecord<TProfileSnapshot> => record !== null,
    );
}

export async function writePlayerProfileSnapshotToSqlite<TProfileSnapshot>(input: {
  playerName: string;
  snapshot: TProfileSnapshot;
  updatedAtMs?: number;
}): Promise<SqlitePlayerProfileRecord<TProfileSnapshot>> {
  const normalizedPlayerName = normalizePlayerProfileName(input.playerName);
  const playerNameKey = toPlayerNameKey(normalizedPlayerName);
  const updatedAtMs = toNonNegativeInteger(input.updatedAtMs) ?? Date.now();
  const serializedSnapshot = JSON.stringify(input.snapshot);

  await executeDatabaseStatement({
    sql: `
      INSERT INTO player_profiles (
        player_name_key,
        player_name,
        schema_version,
        snapshot_json,
        updated_at_ms
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(player_name_key) DO UPDATE SET
        player_name = excluded.player_name,
        schema_version = excluded.schema_version,
        snapshot_json = excluded.snapshot_json,
        updated_at_ms = excluded.updated_at_ms
      WHERE excluded.updated_at_ms >= player_profiles.updated_at_ms
    `,
    args: [
      playerNameKey,
      normalizedPlayerName,
      PLAYER_PROFILE_STORAGE_SCHEMA_VERSION,
      serializedSnapshot,
      updatedAtMs,
    ],
  });

  const persistedProfile = await readPlayerProfileSnapshotFromSqlite<TProfileSnapshot>(
    normalizedPlayerName,
  );
  if (!persistedProfile) {
    throw new Error("Player profile write did not persist.");
  }

  return persistedProfile;
}
