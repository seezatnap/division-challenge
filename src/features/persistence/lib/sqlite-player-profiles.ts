import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import {
  normalizePlayerProfileName,
  PLAYER_PROFILE_STORAGE_SCHEMA_VERSION,
  type PlayerProfileEnvelope,
} from "./local-player-profiles";

const SQLITE_DIRECTORY_NAME = ".sqlite";
const DEFAULT_SQLITE_DATABASE_FILE = "division-challenge.sqlite3";

export interface PlayerProfilesDatabaseLocationSnapshot {
  projectRoot: string;
  sqliteDirectory: string;
  databaseFile: string;
  databasePath: string;
}

export interface SqlitePlayerProfileRecord<TProfileSnapshot>
  extends PlayerProfileEnvelope<TProfileSnapshot> {
  playerNameKey: string;
  updatedAtMs: number;
}

interface Sqlite3Database {
  run: (
    sql: string,
    params: readonly unknown[],
    callback: (error: Error | null) => void,
  ) => void;
  get: (
    sql: string,
    params: readonly unknown[],
    callback: (error: Error | null, row?: unknown) => void,
  ) => void;
}

interface Sqlite3Driver {
  Database: new (
    filename: string,
    callback: (error: Error | null) => void,
  ) => Sqlite3Database;
  verbose?: () => Sqlite3Driver;
}

interface PlayerProfileRow {
  player_name_key?: unknown;
  player_name?: unknown;
  schema_version?: unknown;
  snapshot_json?: unknown;
  updated_at_ms?: unknown;
}

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function resolveGitProjectRootDirectory(startDirectory: string = process.cwd()): string {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    if (existsSync(path.join(currentDirectory, ".git"))) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return path.resolve(startDirectory);
    }

    currentDirectory = parentDirectory;
  }
}

function resolveSqliteDatabaseFileName(): string {
  return (
    getTrimmedNonEmptyString(process.env.SQLITE_DB_FILE) ??
    getTrimmedNonEmptyString(process.env.PLAYER_PROFILES_DB_FILE) ??
    DEFAULT_SQLITE_DATABASE_FILE
  );
}

export function getPlayerProfilesDatabaseLocation(): PlayerProfilesDatabaseLocationSnapshot {
  const projectRoot = resolveGitProjectRootDirectory();
  const sqliteDirectory = path.join(projectRoot, SQLITE_DIRECTORY_NAME);
  const databaseFile = resolveSqliteDatabaseFileName();

  return {
    projectRoot,
    sqliteDirectory,
    databaseFile,
    databasePath: path.join(sqliteDirectory, databaseFile),
  };
}

const requireFromWorkspace = createRequire(path.join(process.cwd(), "package.json"));

let sqlite3Driver: Sqlite3Driver | null = null;
let playerProfilesDatabasePromise: Promise<Sqlite3Database> | null = null;

function resolveSqlite3Driver(): Sqlite3Driver {
  if (sqlite3Driver) {
    return sqlite3Driver;
  }

  const resolvedDriver = requireFromWorkspace("sqlite3") as Sqlite3Driver;
  sqlite3Driver =
    typeof resolvedDriver.verbose === "function" ? resolvedDriver.verbose() : resolvedDriver;
  return sqlite3Driver;
}

function runSqliteStatement(
  database: Sqlite3Database,
  sql: string,
  params: readonly unknown[] = [],
): Promise<void> {
  return new Promise((resolve, reject) => {
    database.run(sql, params, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function getSqliteRow<TRow>(
  database: Sqlite3Database,
  sql: string,
  params: readonly unknown[] = [],
): Promise<TRow | null> {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve((row ?? null) as TRow | null);
    });
  });
}

async function initializePlayerProfilesDatabase(database: Sqlite3Database): Promise<void> {
  await runSqliteStatement(database, "PRAGMA journal_mode = WAL;");
  await runSqliteStatement(
    database,
    `
      CREATE TABLE IF NOT EXISTS player_profiles (
        player_name_key TEXT PRIMARY KEY,
        player_name TEXT NOT NULL,
        schema_version INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL
      )
    `,
  );
  await runSqliteStatement(
    database,
    `
      CREATE INDEX IF NOT EXISTS player_profiles_updated_at_ms_idx
      ON player_profiles(updated_at_ms DESC)
    `,
  );
}

async function getPlayerProfilesDatabase(): Promise<Sqlite3Database> {
  if (playerProfilesDatabasePromise) {
    return playerProfilesDatabasePromise;
  }

  playerProfilesDatabasePromise = (async () => {
    const databaseLocation = getPlayerProfilesDatabaseLocation();
    mkdirSync(databaseLocation.sqliteDirectory, { recursive: true });

    const driver = resolveSqlite3Driver();
    const database = await new Promise<Sqlite3Database>((resolve, reject) => {
      const instance = new driver.Database(databaseLocation.databasePath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(instance);
      });
    });

    await initializePlayerProfilesDatabase(database);
    return database;
  })();

  try {
    return await playerProfilesDatabasePromise;
  } catch (error) {
    playerProfilesDatabasePromise = null;
    throw error;
  }
}

function toPlayerNameKey(playerName: string): string {
  return normalizePlayerProfileName(playerName).toLowerCase();
}

function toSqlitePlayerProfileRecord<TProfileSnapshot>(
  row: PlayerProfileRow,
): SqlitePlayerProfileRecord<TProfileSnapshot> | null {
  const playerNameKey = getTrimmedNonEmptyString(row.player_name_key);
  const playerName = getTrimmedNonEmptyString(row.player_name);
  const snapshotJson = getTrimmedNonEmptyString(row.snapshot_json);
  const updatedAtMs = toNonNegativeInteger(row.updated_at_ms);

  if (!playerNameKey || !playerName || !snapshotJson || updatedAtMs === null) {
    return null;
  }

  if (row.schema_version !== PLAYER_PROFILE_STORAGE_SCHEMA_VERSION) {
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
  const database = await getPlayerProfilesDatabase();
  const row = await getSqliteRow<PlayerProfileRow>(
    database,
    `
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
    [toPlayerNameKey(normalizedPlayerName)],
  );

  if (!row) {
    return null;
  }

  return toSqlitePlayerProfileRecord<TProfileSnapshot>(row);
}

export async function writePlayerProfileSnapshotToSqlite<TProfileSnapshot>(input: {
  playerName: string;
  snapshot: TProfileSnapshot;
  updatedAtMs?: number;
}): Promise<SqlitePlayerProfileRecord<TProfileSnapshot>> {
  const normalizedPlayerName = normalizePlayerProfileName(input.playerName);
  const playerNameKey = toPlayerNameKey(normalizedPlayerName);
  const updatedAtMs = toNonNegativeInteger(input.updatedAtMs) ?? Date.now();
  const database = await getPlayerProfilesDatabase();
  const serializedSnapshot = JSON.stringify(input.snapshot);

  await runSqliteStatement(
    database,
    `
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
    [
      playerNameKey,
      normalizedPlayerName,
      PLAYER_PROFILE_STORAGE_SCHEMA_VERSION,
      serializedSnapshot,
      updatedAtMs,
    ],
  );

  const persistedProfile = await readPlayerProfileSnapshotFromSqlite<TProfileSnapshot>(
    normalizedPlayerName,
  );
  if (!persistedProfile) {
    throw new Error("Player profile write did not persist.");
  }

  return persistedProfile;
}
