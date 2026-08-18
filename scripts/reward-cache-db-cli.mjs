#!/usr/bin/env node

/**
 * Inspect / manage reward image records in the app database (Turso or the
 * local SQLite file) and their objects in storage (R2 or the local fallback).
 * Uses the same modules as the app, so it always matches runtime behaviour.
 */

import { loadRepoEnvFiles, loadTypeScriptModule } from "./lib/load-typescript-module.mjs";

function printUsage() {
  console.log(
    [
      "Usage: node scripts/reward-cache-db-cli.mjs <command> [args]",
      "",
      "Commands:",
      "  path                         Print database + object storage location metadata",
      "  list                         List current reward image state for every slug",
      "  get <dinosaurName>           Fetch one reward's current record + full image history",
      "  delete <dinosaurName>        Delete every image (objects + rows) for one reward",
      "",
      "Environment: reads .env.local / .env (TURSO_* and R2_* variables).",
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

  loadRepoEnvFiles();

  const [cache, storage] = await Promise.all([
    loadTypeScriptModule("src/features/rewards/lib/reward-image-cache.ts"),
    loadTypeScriptModule("src/features/persistence/lib/object-storage.ts"),
  ]);

  if (command === "path") {
    console.log(
      JSON.stringify(
        {
          database: cache.getRewardCacheDatabaseLocation(),
          storage: storage.getRewardImageStorageLocation(),
        },
        null,
        2,
      ),
    );
    return;
  }

  if (command === "list") {
    console.log(JSON.stringify(await cache.listRewardImageCacheDatabaseRecords(), null, 2));
    return;
  }

  if (command === "get") {
    const dinosaurName = rest.join(" ").trim();
    if (!dinosaurName) {
      throw new Error("dinosaurName must be a non-empty string.");
    }

    const [record, history] = await Promise.all([
      cache.getRewardImageCacheDatabaseRecord(dinosaurName),
      cache.listRewardImageHistory(dinosaurName),
    ]);
    console.log(JSON.stringify({ record, history }, null, 2));
    return;
  }

  if (command === "delete") {
    const dinosaurName = rest.join(" ").trim();
    if (!dinosaurName) {
      throw new Error("dinosaurName must be a non-empty string.");
    }

    console.log(JSON.stringify(await cache.deleteRewardImageCacheEntry(dinosaurName), null, 2));
    return;
  }

  printUsage();
  process.exitCode = 1;
}

run()
  .then(() => {
    // libsql / S3 clients can keep the event loop alive briefly; exit cleanly.
    process.exit(process.exitCode ?? 0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "CLI execution failed.");
    process.exit(1);
  });
