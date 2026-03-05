#!/usr/bin/env node

import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const SQLITE_DIRECTORY_NAME = ".sqlite";
const DEFAULT_SQLITE_DATABASE_FILE = "division-challenge.sqlite3";

function toTrimmedValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeDinosaurName(dinosaurName) {
  const normalizedName = toTrimmedValue(dinosaurName);
  if (!normalizedName) {
    throw new Error("dinosaurName must be a non-empty string.");
  }

  return normalizedName;
}

function toRewardImageCacheSlug(dinosaurName) {
  const normalizedName = normalizeDinosaurName(dinosaurName);
  const slug = normalizedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0) {
    throw new Error("dinosaurName must include alphanumeric characters.");
  }

  return slug;
}

function resolveGitProjectRootDirectory(startDirectory = process.cwd()) {
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

function resolveSqliteDatabaseFileName() {
  return (
    toTrimmedValue(process.env.SQLITE_DB_FILE) ??
    toTrimmedValue(process.env.REWARD_CACHE_DB_FILE) ??
    DEFAULT_SQLITE_DATABASE_FILE
  );
}

function getDatabaseLocation() {
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

function createSqliteDriver() {
  const requireFromWorkspace = createRequire(path.join(process.cwd(), "package.json"));
  const sqlite3 = requireFromWorkspace("sqlite3");
  return typeof sqlite3.verbose === "function" ? sqlite3.verbose() : sqlite3;
}

function runSqliteStatement(database, sql, params = []) {
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

function getSqliteRow(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(row ?? null);
    });
  });
}

function allSqliteRows(database, sql, params = []) {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(rows ?? []);
    });
  });
}

async function openDatabase() {
  const location = getDatabaseLocation();
  mkdirSync(location.sqliteDirectory, { recursive: true });
  const sqlite3 = createSqliteDriver();

  const database = await new Promise((resolve, reject) => {
    const instance = new sqlite3.Database(location.databasePath, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve(instance);
    });
  });

  await runSqliteStatement(database, "PRAGMA journal_mode = WAL;");
  await runSqliteStatement(
    database,
    `
      CREATE TABLE IF NOT EXISTS reward_image_cache (
        slug TEXT PRIMARY KEY,
        dinosaur_name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        model TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        extension TEXT NOT NULL,
        absolute_image_path TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL
      )
    `,
  );
  await runSqliteStatement(
    database,
    `
      CREATE TABLE IF NOT EXISTS reward_image_generation_status (
        slug TEXT PRIMARY KEY,
        dinosaur_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ready', 'generating', 'missing')),
        image_path TEXT,
        updated_at_ms INTEGER NOT NULL
      )
    `,
  );

  return database;
}

function printUsage() {
  console.log(
    [
      "Usage: node scripts/reward-cache-db-cli.mjs <command> [args]",
      "",
      "Commands:",
      "  path                         Print sqlite database location metadata",
      "  list                         List cache rows joined with generation status",
      "  get <dinosaurName>           Fetch one cache row by dinosaur name",
      "  delete <dinosaurName>        Delete cache + status rows by dinosaur name",
    ].join("\n"),
  );
}

async function run() {
  const [command, ...rest] = process.argv.slice(2);
  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (command === "path") {
    console.log(JSON.stringify(getDatabaseLocation(), null, 2));
    return;
  }

  const database = await openDatabase();

  if (command === "list") {
    const rows = await allSqliteRows(
      database,
      `
        SELECT
          cache.slug,
          cache.dinosaur_name,
          cache.prompt,
          cache.model,
          cache.mime_type,
          cache.extension,
          cache.absolute_image_path,
          cache.updated_at_ms,
          status.status AS generation_status,
          status.image_path AS generation_image_path,
          status.updated_at_ms AS generation_updated_at_ms
        FROM reward_image_cache AS cache
        LEFT JOIN reward_image_generation_status AS status
          ON status.slug = cache.slug
        ORDER BY cache.updated_at_ms DESC, cache.dinosaur_name COLLATE NOCASE ASC
      `,
    );
    console.log(JSON.stringify(rows, null, 2));
    return;
  }

  if (command === "get") {
    const dinosaurName = normalizeDinosaurName(rest.join(" "));
    const slug = toRewardImageCacheSlug(dinosaurName);
    const row = await getSqliteRow(
      database,
      `
        SELECT
          cache.slug,
          cache.dinosaur_name,
          cache.prompt,
          cache.model,
          cache.mime_type,
          cache.extension,
          cache.absolute_image_path,
          cache.updated_at_ms,
          status.status AS generation_status,
          status.image_path AS generation_image_path,
          status.updated_at_ms AS generation_updated_at_ms
        FROM reward_image_cache AS cache
        LEFT JOIN reward_image_generation_status AS status
          ON status.slug = cache.slug
        WHERE cache.slug = ?
        LIMIT 1
      `,
      [slug],
    );
    console.log(JSON.stringify(row, null, 2));
    return;
  }

  if (command === "delete") {
    const dinosaurName = normalizeDinosaurName(rest.join(" "));
    const slug = toRewardImageCacheSlug(dinosaurName);
    await runSqliteStatement(
      database,
      `
        DELETE FROM reward_image_generation_status
        WHERE slug = ?
      `,
      [slug],
    );
    await runSqliteStatement(
      database,
      `
        DELETE FROM reward_image_cache
        WHERE slug = ?
      `,
      [slug],
    );
    console.log(
      JSON.stringify(
        {
          deleted: true,
          dinosaurName,
          slug,
        },
        null,
        2,
      ),
    );
    return;
  }

  printUsage();
  process.exitCode = 1;
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : "CLI execution failed.");
  process.exitCode = 1;
});
