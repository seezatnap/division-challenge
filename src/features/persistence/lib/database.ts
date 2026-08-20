/**
 * Shared database access for the app: one libsql client that talks to Turso in
 * production (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`) or to a local SQLite
 * file under `<repo-root>/.sqlite/` when no Turso URL is configured. Every
 * server module that needs persistence (reward images, player profiles) goes
 * through `getDatabase()`, which also applies the schema migrations exactly
 * once per process.
 */

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { createClient, type Client, type InStatement, type ResultSet, type Row } from "@libsql/client";

import { DEFAULT_LEGACY_PLAYER_PASSWORD, hashPassword } from "./password-hashing";

export const TURSO_DATABASE_URL_ENV_VAR = "TURSO_DATABASE_URL";
export const TURSO_AUTH_TOKEN_ENV_VAR = "TURSO_AUTH_TOKEN";
export const SQLITE_DB_FILE_ENV_VAR = "SQLITE_DB_FILE";

const SQLITE_DIRECTORY_NAME = ".sqlite";
const DEFAULT_SQLITE_DATABASE_FILE = "division-challenge.sqlite3";

export type DatabaseDriver = "turso" | "local-file";

export type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export interface DatabaseConfig {
  driver: DatabaseDriver;
  /** libsql connection URL (`libsql://…`, `https://…`, or `file:…`). */
  url: string;
  authToken: string | null;
  projectRoot: string;
  sqliteDirectory: string | null;
  databaseFile: string | null;
  databasePath: string | null;
}

/**
 * Safe-to-expose description of where data lives. `url` never carries the
 * auth token; for Turso it is the connection URL, for local files a file: URL.
 */
export interface DatabaseLocationSnapshot {
  driver: DatabaseDriver;
  url: string;
  projectRoot: string;
  sqliteDirectory: string | null;
  databaseFile: string | null;
  databasePath: string | null;
}

export type DatabaseClient = Client;
export type DatabaseStatement = InStatement;
export type DatabaseRow = Row;
export type DatabaseResultSet = ResultSet;

interface SchemaMigration {
  readonly version: number;
  readonly statements: readonly string[];
  /**
   * Optional data step that needs application code (not just SQL). Runs after
   * `statements` and before the version is recorded, so a failure leaves the
   * migration unapplied and it is retried on the next connection. Must be
   * idempotent.
   */
  readonly seed?: (client: Client) => Promise<void>;
}

/**
 * Gives every profile that predates passwords the documented default
 * password so those operators can still log in (and then change it).
 * Each row gets its own salt.
 */
async function seedLegacyPlayerCredentials(client: Client): Promise<void> {
  const legacyProfiles = await client.execute(
    `
      SELECT p.player_name_key, p.player_name
      FROM player_profiles AS p
      LEFT JOIN player_credentials AS c ON c.player_name_key = p.player_name_key
      WHERE c.player_name_key IS NULL
    `,
  );

  for (const row of legacyProfiles.rows) {
    const playerNameKey = typeof row.player_name_key === "string" ? row.player_name_key : null;
    const playerName = typeof row.player_name === "string" ? row.player_name : null;
    if (!playerNameKey || !playerName) {
      continue;
    }

    const nowMs = Date.now();
    await client.execute({
      sql: `
        INSERT OR IGNORE INTO player_credentials (
          player_name_key,
          player_name,
          password_hash,
          created_at_ms,
          updated_at_ms
        )
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [
        playerNameKey,
        playerName,
        await hashPassword(DEFAULT_LEGACY_PLAYER_PASSWORD),
        nowMs,
        nowMs,
      ],
    });
  }
}

const SCHEMA_MIGRATIONS: readonly SchemaMigration[] = [
  {
    version: 1,
    statements: [
      // Every reward image ever created: one row per generated/uploaded object.
      `
        CREATE TABLE IF NOT EXISTS reward_images (
          id TEXT PRIMARY KEY,
          slug TEXT NOT NULL,
          dinosaur_name TEXT NOT NULL,
          prompt TEXT NOT NULL,
          model TEXT NOT NULL,
          mime_type TEXT NOT NULL,
          extension TEXT NOT NULL,
          storage_key TEXT NOT NULL,
          byte_size INTEGER NOT NULL,
          sha256 TEXT NOT NULL,
          source TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS reward_images_slug_created_at_idx
        ON reward_images(slug, created_at_ms DESC)
      `,
      `
        CREATE INDEX IF NOT EXISTS reward_images_slug_sha256_idx
        ON reward_images(slug, sha256)
      `,
      // Current state per reward slug: which image is live + generation status.
      `
        CREATE TABLE IF NOT EXISTS reward_image_states (
          slug TEXT PRIMARY KEY,
          dinosaur_name TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('ready', 'generating', 'missing')),
          current_image_id TEXT,
          updated_at_ms INTEGER NOT NULL
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS reward_image_states_updated_at_idx
        ON reward_image_states(updated_at_ms DESC)
      `,
      `
        CREATE TABLE IF NOT EXISTS player_profiles (
          player_name_key TEXT PRIMARY KEY,
          player_name TEXT NOT NULL,
          schema_version INTEGER NOT NULL,
          snapshot_json TEXT NOT NULL,
          updated_at_ms INTEGER NOT NULL
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS player_profiles_updated_at_ms_idx
        ON player_profiles(updated_at_ms DESC)
      `,
    ],
  },
  {
    version: 2,
    statements: [
      // Model-written dossier prose. Deliberately stores no measurements,
      // dates or taxonomy: those always come from the curated fact sheet at
      // read time, so a stored row can never carry a stale or invented fact.
      `
        CREATE TABLE IF NOT EXISTS reward_dossiers (
          slug TEXT PRIMARY KEY,
          subject_name TEXT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('primary', 'hybrid')),
          description TEXT NOT NULL,
          attributes_json TEXT NOT NULL,
          source TEXT NOT NULL,
          model TEXT NOT NULL,
          prompt TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS reward_dossiers_updated_at_idx
        ON reward_dossiers(updated_at_ms DESC)
      `,
    ],
  },
  {
    version: 3,
    statements: [
      // One password per operator. `password_hash` is a self-describing scrypt
      // string (see ./password-hashing); plaintext is never stored.
      `
        CREATE TABLE IF NOT EXISTS player_credentials (
          player_name_key TEXT PRIMARY KEY,
          player_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          updated_at_ms INTEGER NOT NULL
        )
      `,
      // Login sessions behind the HttpOnly cookie. Only a sha256 of the cookie
      // token is stored, so a leaked table cannot be replayed.
      `
        CREATE TABLE IF NOT EXISTS player_sessions (
          token_hash TEXT PRIMARY KEY,
          player_name_key TEXT NOT NULL,
          created_at_ms INTEGER NOT NULL,
          expires_at_ms INTEGER NOT NULL
        )
      `,
      `
        CREATE INDEX IF NOT EXISTS player_sessions_player_name_key_idx
        ON player_sessions(player_name_key)
      `,
      `
        CREATE INDEX IF NOT EXISTS player_sessions_expires_at_idx
        ON player_sessions(expires_at_ms)
      `,
    ],
    seed: seedLegacyPlayerCredentials,
  },
];

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function resolveGitProjectRootDirectory(startDirectory: string = process.cwd()): string {
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

function resolveSqliteDatabaseFileName(env: RuntimeEnvironment): string {
  return (
    getTrimmedNonEmptyString(env[SQLITE_DB_FILE_ENV_VAR]) ??
    getTrimmedNonEmptyString(env.REWARD_CACHE_DB_FILE) ??
    getTrimmedNonEmptyString(env.PLAYER_PROFILES_DB_FILE) ??
    DEFAULT_SQLITE_DATABASE_FILE
  );
}

function toFileUrl(absolutePath: string): string {
  // libsql accepts `file:` + an absolute path (no `//` host part needed).
  return `file:${absolutePath}`;
}

function fromFileUrl(url: string): string {
  const withoutScheme = url.replace(/^file:(\/\/)?/, "");
  return path.resolve(withoutScheme);
}

/**
 * Resolves the database configuration from the environment. Turso wins when
 * `TURSO_DATABASE_URL` is set (a `file:` URL there is honoured as a local
 * override, which is what tests use); otherwise the classic repo-root
 * `.sqlite/<file>` location applies.
 */
export function resolveDatabaseConfig(env: RuntimeEnvironment = process.env): DatabaseConfig {
  const projectRoot = resolveGitProjectRootDirectory();
  const configuredUrl = getTrimmedNonEmptyString(env[TURSO_DATABASE_URL_ENV_VAR]);

  if (configuredUrl && !configuredUrl.startsWith("file:")) {
    return {
      driver: "turso",
      url: configuredUrl,
      authToken: getTrimmedNonEmptyString(env[TURSO_AUTH_TOKEN_ENV_VAR]),
      projectRoot,
      sqliteDirectory: null,
      databaseFile: null,
      databasePath: null,
    };
  }

  if (configuredUrl) {
    const databasePath = fromFileUrl(configuredUrl);
    return {
      driver: "local-file",
      url: toFileUrl(databasePath),
      authToken: null,
      projectRoot,
      sqliteDirectory: path.dirname(databasePath),
      databaseFile: path.basename(databasePath),
      databasePath,
    };
  }

  const sqliteDirectory = path.join(projectRoot, SQLITE_DIRECTORY_NAME);
  const databaseFile = resolveSqliteDatabaseFileName(env);
  const databasePath = path.join(sqliteDirectory, databaseFile);

  return {
    driver: "local-file",
    url: toFileUrl(databasePath),
    authToken: null,
    projectRoot,
    sqliteDirectory,
    databaseFile,
    databasePath,
  };
}

export function getDatabaseLocation(env: RuntimeEnvironment = process.env): DatabaseLocationSnapshot {
  const config = resolveDatabaseConfig(env);
  return {
    driver: config.driver,
    url: config.url,
    projectRoot: config.projectRoot,
    sqliteDirectory: config.sqliteDirectory,
    databaseFile: config.databaseFile,
    databasePath: config.databasePath,
  };
}

export function isTursoConfigured(env: RuntimeEnvironment = process.env): boolean {
  return resolveDatabaseConfig(env).driver === "turso";
}

async function applySchemaMigrations(client: Client, config: DatabaseConfig): Promise<void> {
  if (config.driver === "local-file") {
    await client.execute("PRAGMA journal_mode = WAL");
  }

  await client.execute(
    `
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at_ms INTEGER NOT NULL
      )
    `,
  );

  const appliedResult = await client.execute("SELECT version FROM schema_migrations");
  const appliedVersions = new Set<number>();
  for (const row of appliedResult.rows) {
    const version = Number(row.version);
    if (Number.isFinite(version)) {
      appliedVersions.add(version);
    }
  }

  for (const migration of SCHEMA_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    await client.batch(
      migration.statements.map((sql) => ({ sql, args: [] })),
      "write",
    );

    if (migration.seed) {
      await migration.seed(client);
    }

    await client.execute({
      sql: "INSERT OR IGNORE INTO schema_migrations (version, applied_at_ms) VALUES (?, ?)",
      args: [migration.version, Date.now()],
    });
  }
}

let databaseClientPromise: Promise<Client> | null = null;

/**
 * Returns the process-wide database client, creating it (and applying schema
 * migrations) on first use. A failed initialisation is not cached so the next
 * call retries.
 */
export async function getDatabase(): Promise<Client> {
  if (databaseClientPromise) {
    return databaseClientPromise;
  }

  databaseClientPromise = (async () => {
    const config = resolveDatabaseConfig(process.env);

    if (config.driver === "local-file" && config.sqliteDirectory) {
      mkdirSync(config.sqliteDirectory, { recursive: true });
    }

    const client = createClient({
      url: config.url,
      ...(config.authToken ? { authToken: config.authToken } : {}),
    });

    await applySchemaMigrations(client, config);
    return client;
  })();

  try {
    return await databaseClientPromise;
  } catch (error) {
    databaseClientPromise = null;
    throw error;
  }
}

/** Convenience wrapper: run one statement against the shared client. */
export async function executeDatabaseStatement(statement: InStatement): Promise<ResultSet> {
  const client = await getDatabase();
  return client.execute(statement);
}

/** Convenience wrapper: run several statements in one write transaction. */
export async function executeDatabaseBatch(statements: readonly InStatement[]): Promise<ResultSet[]> {
  const client = await getDatabase();
  return client.batch([...statements], "write");
}
