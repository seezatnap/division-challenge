#!/usr/bin/env node

/**
 * One-shot migration from the legacy layout (images in `public/rewards/`,
 * metadata + player profiles in the local `.sqlite/` file) to the new one:
 *
 *   • every image is uploaded to object storage (Cloudflare R2) and recorded
 *     in `reward_images` / `reward_image_states` in the app database (Turso);
 *   • player profiles are copied into the app database with their stored
 *     `/rewards/<slug>.<ext>` image paths rewritten to the new image URLs;
 *   • dossier prose from `public/artifacts/dossiers/**.json` is imported into
 *     the `reward_dossiers` table (facts are never imported — they come from
 *     the curated fact sheet at read time).
 *
 * Safe to re-run: identical image bytes are skipped (sha256 match) and profile
 * writes never overwrite newer snapshots.
 *
 * Usage:
 *   node scripts/migrate-rewards-to-r2-and-turso.mjs [options]
 *
 * Options:
 *   --dry-run                Print the plan; do not upload or write anything
 *   --rewards-dir <path>     Legacy image directory (default: public/rewards)
 *   --source-db <path>       Legacy sqlite file (default: .sqlite/<SQLITE_DB_FILE>)
 *   --skip-images            Do not migrate images
 *   --skip-profiles          Do not migrate player profiles
 *   --skip-dossiers          Do not migrate dossier prose
 *   --dossiers-dir <path>    Legacy dossier directory (default: public/artifacts/dossiers)
 *   --player <name>          Only migrate this player (repeatable)
 *   --force                  Re-upload images even if identical bytes are recorded
 *   --allow-local-target     Proceed even if the target is not Turso / R2
 *
 * Reads TURSO_* and R2_* from .env.local / .env (or the environment).
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { createClient } from "@libsql/client";

import {
  loadRepoEnvFiles,
  loadTypeScriptModule,
  repoRoot,
} from "./lib/load-typescript-module.mjs";

const SUPPORTED_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif", "svg"]);
const MIME_TYPE_BY_EXTENSION = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};
const LEGACY_REWARD_IMAGE_PATH_PATTERN =
  /^\/rewards\/([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.(png|jpg|jpeg|webp|gif|svg)(?:\?.*)?$/i;

function parseArgs(argv) {
  const options = {
    dryRun: false,
    rewardsDir: path.join(repoRoot, "public", "rewards"),
    sourceDb: null,
    skipImages: false,
    skipProfiles: false,
    skipDossiers: false,
    dossiersDir: path.join(repoRoot, "public", "artifacts", "dossiers"),
    players: [],
    force: false,
    allowLocalTarget: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextValue = () => {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;
      return value;
    };

    switch (argument) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--rewards-dir":
        options.rewardsDir = path.resolve(nextValue());
        break;
      case "--source-db":
        options.sourceDb = path.resolve(nextValue());
        break;
      case "--skip-images":
        options.skipImages = true;
        break;
      case "--skip-profiles":
        options.skipProfiles = true;
        break;
      case "--skip-dossiers":
        options.skipDossiers = true;
        break;
      case "--dossiers-dir":
        options.dossiersDir = path.resolve(nextValue());
        break;
      case "--player":
        options.players.push(nextValue());
        break;
      case "--force":
        options.force = true;
        break;
      case "--allow-local-target":
        options.allowLocalTarget = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${argument}`);
    }
  }

  return options;
}

function printUsage() {
  console.log(
    [
      "Usage: node scripts/migrate-rewards-to-r2-and-turso.mjs [options]",
      "",
      "  --dry-run                Print the plan; do not upload or write anything",
      "  --rewards-dir <path>     Legacy image directory (default: public/rewards)",
      "  --source-db <path>       Legacy sqlite file (default: .sqlite/<SQLITE_DB_FILE>)",
      "  --skip-images            Do not migrate images",
      "  --skip-profiles          Do not migrate player profiles",
      "  --skip-dossiers          Do not migrate dossier prose",
      "  --dossiers-dir <path>    Legacy dossier directory (default: public/artifacts/dossiers)",
      "  --player <name>          Only migrate this player (repeatable)",
      "  --force                  Re-upload images even if identical bytes are recorded",
      "  --allow-local-target     Proceed even if the target is not Turso / R2",
    ].join("\n"),
  );
}

function log(message) {
  console.log(message);
}

function toTitleCaseFromSlug(slug) {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getTrimmedNonEmptyString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

/** Finds the newest image file per slug in the legacy rewards directory. */
async function scanLegacyImages(rewardsDir) {
  if (!existsSync(rewardsDir)) {
    return [];
  }

  const entries = await readdir(rewardsDir, { withFileTypes: true });
  const bySlug = new Map();

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const match = /^(.+)\.([a-z0-9]+)$/i.exec(entry.name);
    if (!match) {
      continue;
    }

    const [, slug, rawExtension] = match;
    const extension = rawExtension.toLowerCase();
    if (!SUPPORTED_IMAGE_EXTENSIONS.has(extension) || entry.name.endsWith(".metadata.json")) {
      continue;
    }

    const absolutePath = path.join(rewardsDir, entry.name);
    const fileStats = await stat(absolutePath);
    const candidate = {
      slug,
      extension,
      absolutePath,
      modifiedTimeMs: Math.floor(fileStats.mtimeMs),
      byteSize: fileStats.size,
    };

    const existing = bySlug.get(slug);
    if (!existing || existing.modifiedTimeMs < candidate.modifiedTimeMs) {
      bySlug.set(slug, candidate);
    }
  }

  return [...bySlug.values()].sort((left, right) => left.slug.localeCompare(right.slug));
}

async function openLegacyDatabase(sourceDbPath) {
  if (!sourceDbPath || !existsSync(sourceDbPath)) {
    return null;
  }

  const client = createClient({ url: `file:${sourceDbPath}` });
  const tables = await client.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('reward_image_cache', 'player_profiles')",
  );
  const tableNames = new Set(tables.rows.map((row) => String(row.name)));

  return {
    client,
    hasRewardImageCache: tableNames.has("reward_image_cache"),
    hasPlayerProfiles: tableNames.has("player_profiles"),
  };
}

async function readLegacyCacheRows(legacyDatabase) {
  if (!legacyDatabase?.hasRewardImageCache) {
    return new Map();
  }

  const result = await legacyDatabase.client.execute(
    "SELECT slug, dinosaur_name, prompt, model, mime_type, extension FROM reward_image_cache",
  );
  const bySlug = new Map();
  for (const row of result.rows) {
    const slug = getTrimmedNonEmptyString(row.slug);
    if (slug) {
      bySlug.set(slug, {
        dinosaurName: getTrimmedNonEmptyString(row.dinosaur_name),
        prompt: getTrimmedNonEmptyString(row.prompt),
        model: getTrimmedNonEmptyString(row.model),
        mimeType: getTrimmedNonEmptyString(row.mime_type),
      });
    }
  }

  return bySlug;
}

async function readLegacyPlayerProfiles(legacyDatabase, playerFilter) {
  if (!legacyDatabase?.hasPlayerProfiles) {
    return [];
  }

  const result = await legacyDatabase.client.execute(
    "SELECT player_name_key, player_name, schema_version, snapshot_json, updated_at_ms FROM player_profiles ORDER BY updated_at_ms DESC",
  );

  const wantedKeys =
    playerFilter.length > 0
      ? new Set(playerFilter.map((name) => name.trim().replace(/\s+/g, " ").toLowerCase()))
      : null;

  const profiles = [];
  for (const row of result.rows) {
    const playerNameKey = getTrimmedNonEmptyString(row.player_name_key);
    const playerName = getTrimmedNonEmptyString(row.player_name);
    const snapshotJson = getTrimmedNonEmptyString(row.snapshot_json);
    if (!playerNameKey || !playerName || !snapshotJson) {
      continue;
    }

    if (wantedKeys && !wantedKeys.has(playerNameKey)) {
      continue;
    }

    let snapshot;
    try {
      snapshot = JSON.parse(snapshotJson);
    } catch {
      continue;
    }

    profiles.push({
      playerNameKey,
      playerName,
      schemaVersion: Number(row.schema_version),
      snapshot,
      updatedAtMs: Number(row.updated_at_ms) || Date.now(),
    });
  }

  return profiles;
}

/**
 * Recursively rewrites legacy `/rewards/<slug>.<ext>` strings inside a JSON
 * value using `resolveImagePath(slug)`; returns the new value and a count.
 */
function rewriteRewardImagePaths(value, resolveImagePath, stats) {
  if (typeof value === "string") {
    const match = LEGACY_REWARD_IMAGE_PATH_PATTERN.exec(value);
    if (!match) {
      return value;
    }

    const replacement = resolveImagePath(match[1].toLowerCase());
    if (!replacement) {
      stats.unresolved.add(match[1].toLowerCase());
      return value;
    }

    if (replacement !== value) {
      stats.rewritten += 1;
    }
    return replacement;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => rewriteRewardImagePaths(entry, resolveImagePath, stats));
  }

  if (value && typeof value === "object") {
    const next = {};
    for (const [key, entry] of Object.entries(value)) {
      next[key] = rewriteRewardImagePaths(entry, resolveImagePath, stats);
    }
    return next;
  }

  return value;
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    return;
  }

  loadRepoEnvFiles();

  const [database, storageModule, cache, profiles, dossierStore, dossiers] = await Promise.all([
    loadTypeScriptModule("src/features/persistence/lib/database.ts"),
    loadTypeScriptModule("src/features/persistence/lib/object-storage.ts"),
    loadTypeScriptModule("src/features/rewards/lib/reward-image-cache.ts"),
    loadTypeScriptModule("src/features/persistence/lib/sqlite-player-profiles.ts"),
    loadTypeScriptModule("src/features/rewards/lib/dossier-store.ts"),
    loadTypeScriptModule("src/features/rewards/lib/dino-dossiers.ts"),
  ]);

  const targetDatabase = database.getDatabaseLocation();
  const storage = storageModule.getDefaultRewardImageStorage();
  const targetStorage = storageModule.getRewardImageStorageLocation(storage);

  const legacyConfig = database.resolveDatabaseConfig({
    ...process.env,
    TURSO_DATABASE_URL: undefined,
  });
  const sourceDbPath = options.sourceDb ?? legacyConfig.databasePath;

  log("== Reward migration ==");
  log(`mode:            ${options.dryRun ? "DRY RUN (no writes)" : "LIVE"}`);
  log(`legacy images:   ${options.rewardsDir}`);
  log(`legacy database: ${sourceDbPath ?? "(none)"}${sourceDbPath && !existsSync(sourceDbPath) ? "  [not found]" : ""}`);
  log(`target database: ${targetDatabase.driver} → ${targetDatabase.url}`);
  log(
    `target storage:  ${targetStorage.kind}${
      targetStorage.kind === "r2"
        ? ` → bucket ${targetStorage.bucket} (${targetStorage.endpoint}), public: ${targetStorage.publicBaseUrl ?? "(none — images served via /rewards/<slug>.<ext>)"}`
        : ` → ${targetStorage.directory}`
    }`,
  );
  log("");

  const targetIsLocal = targetDatabase.driver !== "turso" || targetStorage.kind !== "r2";
  if (targetIsLocal && !options.allowLocalTarget && !options.dryRun) {
    throw new Error(
      [
        "The migration target is not fully remote:",
        targetDatabase.driver !== "turso"
          ? "  • database is a local file (set TURSO_DATABASE_URL + TURSO_AUTH_TOKEN)"
          : null,
        targetStorage.kind !== "r2"
          ? "  • object storage is the local fallback (set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)"
          : null,
        "Pass --allow-local-target to migrate into local targets anyway.",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  const legacyDatabase = await openLegacyDatabase(sourceDbPath);
  const sameDatabaseFile =
    legacyDatabase !== null &&
    targetDatabase.driver === "local-file" &&
    targetDatabase.databasePath !== null &&
    path.resolve(targetDatabase.databasePath) === path.resolve(sourceDbPath);

  /** Slugs that have (or, in a dry run, would have) a migrated image. */
  const migratedSlugs = new Set();

  const summary = {
    imagesFound: 0,
    imagesUploaded: 0,
    imagesSkippedDuplicate: 0,
    imagesFailed: 0,
    profilesFound: 0,
    profilesWritten: 0,
    dossiersFound: 0,
    dossiersImported: 0,
    dossiersSkipped: 0,
    profilePathsRewritten: 0,
    unresolvedSlugs: new Set(),
  };

  // ── Images ───────────────────────────────────────────────────────────────
  if (!options.skipImages) {
    const legacyImages = await scanLegacyImages(options.rewardsDir);
    const legacyCacheRows = await readLegacyCacheRows(legacyDatabase);
    summary.imagesFound = legacyImages.length;
    log(`-- Images: ${legacyImages.length} found in ${options.rewardsDir}`);

    for (const legacyImage of legacyImages) {
      const sidecar = await readJsonIfExists(`${legacyImage.absolutePath}.metadata.json`);
      const legacyRow = legacyCacheRows.get(legacyImage.slug) ?? null;
      const dinosaurName =
        getTrimmedNonEmptyString(sidecar?.dinosaurName) ??
        legacyRow?.dinosaurName ??
        toTitleCaseFromSlug(legacyImage.slug);
      const prompt =
        getTrimmedNonEmptyString(sidecar?.prompt) ??
        legacyRow?.prompt ??
        `Migrated reward image for ${dinosaurName}.`;
      const model =
        getTrimmedNonEmptyString(sidecar?.model) ?? legacyRow?.model ?? "filesystem-cache";
      const mimeType =
        getTrimmedNonEmptyString(sidecar?.mimeType) ??
        legacyRow?.mimeType ??
        MIME_TYPE_BY_EXTENSION[legacyImage.extension];

      const imageBuffer = await readFile(legacyImage.absolutePath);
      const sha256 = createHash("sha256").update(imageBuffer).digest("hex");
      const targetSlug = cache.toRewardImageCacheSlug(dinosaurName);
      const label = `${legacyImage.slug}.${legacyImage.extension} (${dinosaurName}, ${imageBuffer.byteLength} bytes)${
        targetSlug !== legacyImage.slug ? ` [note: recorded under slug "${targetSlug}" derived from its metadata name]` : ""
      }`;

      try {
        if (!options.force) {
          const existing = await cache.findRewardImageBySha256(dinosaurName, sha256, { storage });
          if (existing) {
            summary.imagesSkippedDuplicate += 1;
            migratedSlugs.add(targetSlug);
            log(`  = ${label}: already recorded as ${existing.id} → skip`);
            continue;
          }
        }

        if (options.dryRun) {
          summary.imagesUploaded += 1;
          migratedSlugs.add(targetSlug);
          log(`  + ${label}: would upload as ${storage.keyPrefix}/${targetSlug}/<id>.${legacyImage.extension}`);
          continue;
        }

        const record = await cache.persistRewardImage(
          {
            dinosaurName,
            prompt,
            model,
            mimeType,
            imageBase64: imageBuffer.toString("base64"),
          },
          {
            storage,
            createdAtMs: legacyImage.modifiedTimeMs,
            source: "filesystem-migration",
          },
        );
        summary.imagesUploaded += 1;
        migratedSlugs.add(targetSlug);
        log(`  + ${label}: uploaded → ${record.storageKey} (${record.imagePath})`);
      } catch (error) {
        summary.imagesFailed += 1;
        log(`  ! ${label}: FAILED — ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    log("");
  }

  // ── Player profiles ──────────────────────────────────────────────────────
  if (!options.skipProfiles) {
    const legacyProfiles = await readLegacyPlayerProfiles(legacyDatabase, options.players);
    summary.profilesFound = legacyProfiles.length;
    log(
      `-- Player profiles: ${legacyProfiles.length} found in ${legacyDatabase ? sourceDbPath : "(no legacy database)"}${
        sameDatabaseFile ? " (same file as target — rewriting image paths in place)" : ""
      }`,
    );

    // Resolve current image paths once for every slug referenced by profiles.
    const imagePathBySlug = new Map();
    const resolveImagePath = (slug) => imagePathBySlug.get(slug) ?? null;
    const referencedSlugs = new Set();
    for (const profile of legacyProfiles) {
      rewriteRewardImagePaths(
        profile.snapshot,
        (slug) => {
          referencedSlugs.add(slug);
          return null;
        },
        { rewritten: 0, unresolved: new Set() },
      );
    }
    for (const slug of referencedSlugs) {
      const currentImage = await cache.findCurrentRewardImage(slug, { storage }).catch(() => null);
      if (currentImage) {
        imagePathBySlug.set(slug, currentImage.imagePath);
      } else if (options.dryRun && migratedSlugs.has(slug)) {
        imagePathBySlug.set(slug, `<new image URL for ${slug}>`);
      }
    }

    for (const profile of legacyProfiles) {
      const stats = { rewritten: 0, unresolved: new Set() };
      const rewrittenSnapshot = rewriteRewardImagePaths(profile.snapshot, resolveImagePath, stats);
      for (const slug of stats.unresolved) {
        summary.unresolvedSlugs.add(slug);
      }
      summary.profilePathsRewritten += stats.rewritten;

      const label = `${profile.playerName} (updated ${new Date(profile.updatedAtMs).toISOString()})`;
      if (options.dryRun) {
        summary.profilesWritten += 1;
        log(`  + ${label}: would write, ${stats.rewritten} image path(s) rewritten`);
        continue;
      }

      try {
        await profiles.writePlayerProfileSnapshotToSqlite({
          playerName: profile.playerName,
          snapshot: rewrittenSnapshot,
          updatedAtMs: profile.updatedAtMs,
        });
        summary.profilesWritten += 1;
        log(`  + ${label}: written, ${stats.rewritten} image path(s) rewritten`);
      } catch (error) {
        log(`  ! ${label}: FAILED — ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    log("");
  }

  // ── Dossier prose ────────────────────────────────────────────────────────
  if (!options.skipDossiers) {
    const dossierFiles = [];
    for (const kind of ["primary", "hybrid"]) {
      const kindDirectory = path.join(options.dossiersDir, kind);
      if (!existsSync(kindDirectory)) {
        continue;
      }

      const entries = await readdir(kindDirectory, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith(".json")) {
          dossierFiles.push({ kind, absolutePath: path.join(kindDirectory, entry.name) });
        }
      }
    }

    summary.dossiersFound = dossierFiles.length;
    log(`-- Dossiers: ${dossierFiles.length} found in ${options.dossiersDir}`);

    for (const dossierFile of dossierFiles.sort((left, right) =>
      left.absolutePath.localeCompare(right.absolutePath),
    )) {
      const payload = await readJsonIfExists(dossierFile.absolutePath);
      const description = getTrimmedNonEmptyString(payload?.description);
      const source = getTrimmedNonEmptyString(payload?.generator?.source);

      // Hybrid payloads sometimes carry a model-invented portmanteau name
      // ("Brachiotops"), which the app never looks up. Rebuild the canonical
      // "Hybrid A + B" key from the parent species instead.
      let subjectName = getTrimmedNonEmptyString(payload?.subjectName);
      if (dossierFile.kind === "hybrid") {
        const sourceDinosaurs = Array.isArray(payload?.sourceDinosaurs)
          ? payload.sourceDinosaurs.map((entry) => getTrimmedNonEmptyString(entry)).filter(Boolean)
          : [];
        subjectName =
          sourceDinosaurs.length === 2
            ? dossiers.buildHybridGenerationAssetName({
                firstDinosaurName: sourceDinosaurs[0],
                secondDinosaurName: sourceDinosaurs[1],
              })
            : null;
      }

      const label = subjectName ?? path.basename(dossierFile.absolutePath);

      if (!subjectName || !description) {
        summary.dossiersSkipped += 1;
        log(`  - ${label}: unreadable, skipped`);
        continue;
      }

      // Only real model prose is worth keeping; the old deterministic fallback
      // text was template-generated and is replaced by the curated description.
      if (source !== "openai" && source !== "gemini") {
        summary.dossiersSkipped += 1;
        log(`  - ${label}: source "${source ?? "unknown"}" is not model-written, skipped`);
        continue;
      }

      if (!options.force) {
        const existing = await dossierStore.readStoredRewardDossier(subjectName).catch(() => null);
        if (existing && (existing.source === "openai" || existing.source === "gemini")) {
          summary.dossiersSkipped += 1;
          log(`  = ${label}: already stored, skipped`);
          continue;
        }
      }

      const attributes = Array.isArray(payload?.attributes)
        ? payload.attributes.map((entry) => getTrimmedNonEmptyString(entry)).filter(Boolean)
        : [];
      const createdAtMs = Date.parse(payload?.generatedAt ?? "");

      if (options.dryRun) {
        summary.dossiersImported += 1;
        log(`  + ${label}: would import ${description.length} characters of ${source} prose`);
        continue;
      }

      try {
        await dossierStore.saveRewardDossier({
          subjectName,
          kind: dossierFile.kind === "hybrid" ? "hybrid" : "primary",
          description,
          attributes,
          source,
          model: getTrimmedNonEmptyString(payload?.generator?.model) ?? "unknown-model",
          prompt: getTrimmedNonEmptyString(payload?.generator?.prompt) ?? "",
          ...(Number.isFinite(createdAtMs) ? { createdAtMs } : {}),
        });
        summary.dossiersImported += 1;
        log(`  + ${label}: imported ${source} prose`);
      } catch (error) {
        summary.dossiersSkipped += 1;
        log(`  ! ${label}: FAILED — ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    log("");
  }

  // ── Summary ──────────────────────────────────────────────────────────────
  log("== Summary ==");
  log(`images:   ${summary.imagesFound} found, ${summary.imagesUploaded} ${options.dryRun ? "to upload" : "uploaded"}, ${summary.imagesSkippedDuplicate} already recorded, ${summary.imagesFailed} failed`);
  log(`profiles: ${summary.profilesFound} found, ${summary.profilesWritten} ${options.dryRun ? "to write" : "written"}, ${summary.profilePathsRewritten} image path(s) rewritten`);
  log(`dossiers: ${summary.dossiersFound} found, ${summary.dossiersImported} ${options.dryRun ? "to import" : "imported"}, ${summary.dossiersSkipped} skipped`);
  if (summary.dossiersImported > 0) {
    log("note:     imported prose predates the fact-grounded prompt. Only the description text is kept —");
    log("          every measurement, date and classification shown comes from the curated fact sheet.");
  }
  if (summary.unresolvedSlugs.size > 0) {
    log(
      `note:     ${summary.unresolvedSlugs.size} image slug(s) referenced by profiles have no migrated image and keep their legacy path (still served by /rewards/<slug>.<ext> once an image exists): ${[...summary.unresolvedSlugs].sort().join(", ")}`,
    );
  }
  if (!options.dryRun && summary.imagesUploaded > 0) {
    log("");
    log("Next steps:");
    log("  • Verify with: npm run db:reward-cache:list");
    log("  • Once happy, remove the legacy files: rm -rf public/rewards");
    log("    (Next.js serves public/ files before app routes, so stale copies there would shadow /rewards/<slug>.<ext>.)");
  }

  if (legacyDatabase) {
    legacyDatabase.client.close();
  }
  if (summary.imagesFailed > 0) {
    process.exitCode = 1;
  }
}

run()
  .then(() => {
    process.exit(process.exitCode ?? 0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
