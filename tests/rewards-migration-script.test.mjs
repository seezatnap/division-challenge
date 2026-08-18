import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { createClient } from "@libsql/client";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");
const scriptPath = path.join(repoRoot, "scripts", "migrate-rewards-to-r2-and-turso.mjs");

function runMigration(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** Builds a legacy layout: rewards dir with images + sidecars and a sqlite file. */
async function createLegacyFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "dino-reward-migration-"));
  const rewardsDir = path.join(root, "public-rewards");
  await mkdir(rewardsDir, { recursive: true });

  await writeFile(path.join(rewardsDir, "velociraptor.png"), Buffer.from("velociraptor-png-bytes"));
  await writeFile(
    path.join(rewardsDir, "velociraptor.png.metadata.json"),
    JSON.stringify({
      dinosaurName: "Velociraptor",
      prompt: "sidecar prompt",
      model: "gemini-3-pro-image-preview",
      mimeType: "image/png",
    }),
  );
  // No sidecar: metadata must come from the legacy database row.
  await writeFile(
    path.join(rewardsDir, "hybrid-triceratops-velociraptor.jpg"),
    Buffer.from("hybrid-jpg-bytes"),
  );
  // Not an image: ignored.
  await writeFile(path.join(rewardsDir, "notes.txt"), "ignore me");

  const legacyDbPath = path.join(root, "legacy.sqlite3");
  const legacy = createClient({ url: `file:${legacyDbPath}` });
  await legacy.batch(
    [
      `CREATE TABLE reward_image_cache (
        slug TEXT PRIMARY KEY, dinosaur_name TEXT NOT NULL, prompt TEXT NOT NULL, model TEXT NOT NULL,
        mime_type TEXT NOT NULL, extension TEXT NOT NULL, absolute_image_path TEXT NOT NULL, updated_at_ms INTEGER NOT NULL)`,
      {
        sql: "INSERT INTO reward_image_cache VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        args: [
          "hybrid-triceratops-velociraptor",
          "Hybrid Triceratops + Velociraptor",
          "legacy db prompt",
          "gpt-image-2",
          "image/jpeg",
          "jpg",
          "/old/path.jpg",
          1000,
        ],
      },
      `CREATE TABLE player_profiles (
        player_name_key TEXT PRIMARY KEY, player_name TEXT NOT NULL, schema_version INTEGER NOT NULL,
        snapshot_json TEXT NOT NULL, updated_at_ms INTEGER NOT NULL)`,
      {
        sql: "INSERT INTO player_profiles VALUES (?, ?, ?, ?, ?)",
        args: [
          "gus",
          "Gus",
          1,
          JSON.stringify({
            gameSession: {
              totalProblemsSolved: 5,
              amberImagePath: "/rewards/amber-resonance-crystal.jpg?v=5",
              unlockedRewards: [
                {
                  rewardId: "reward-1",
                  dinosaurName: "Velociraptor",
                  imagePath: "/rewards/velociraptor.png?v=123",
                  earnedAt: "2026-02-17T09:00:00.000Z",
                  milestoneSolvedCount: 5,
                },
              ],
              unlockedHybrids: [
                {
                  hybridId: "h1",
                  pairKey: "triceratops|velociraptor",
                  imagePath: "/rewards/hybrid-triceratops-velociraptor.jpg",
                },
              ],
            },
            activeRewardReveal: { initialImagePath: null },
          }),
          2000,
        ],
      },
      {
        sql: "INSERT INTO player_profiles VALUES (?, ?, ?, ?, ?)",
        args: ["other", "Other", 1, JSON.stringify({ gameSession: {} }), 1500],
      },
    ],
    "write",
  );
  legacy.close();

  return {
    root,
    rewardsDir,
    legacyDbPath,
    targetDbPath: path.join(root, "target.sqlite3"),
    storageDir: path.join(root, "storage"),
  };
}

test("migration script uploads legacy images, records them, rewrites profile paths, and is idempotent", async () => {
  const fixture = await createLegacyFixture();
  const env = {
    TURSO_DATABASE_URL: `file:${fixture.targetDbPath}`,
    TURSO_AUTH_TOKEN: "",
    REWARD_IMAGE_STORAGE_DIRECTORY: fixture.storageDir,
    R2_ACCOUNT_ID: "",
    R2_ACCESS_KEY_ID: "",
    R2_SECRET_ACCESS_KEY: "",
    R2_BUCKET: "",
    R2_PUBLIC_BASE_URL: "",
  };
  const baseArgs = ["--rewards-dir", fixture.rewardsDir, "--source-db", fixture.legacyDbPath];

  // Refuses local targets unless explicitly allowed.
  const refused = await runMigration(baseArgs, env);
  assert.equal(refused.code, 1);
  assert.match(refused.stderr, /not fully remote/);

  // Dry run writes nothing.
  const dryRun = await runMigration([...baseArgs, "--dry-run"], env);
  assert.equal(dryRun.code, 0, dryRun.stderr);
  assert.match(dryRun.stdout, /2 found, 2 to upload/);
  await assert.rejects(readdir(fixture.storageDir));

  const live = await runMigration([...baseArgs, "--allow-local-target", "--player", "Gus"], env);
  assert.equal(live.code, 0, `${live.stdout}\n${live.stderr}`);
  assert.match(live.stdout, /images: {3}2 found, 2 uploaded, 0 already recorded, 0 failed/);
  assert.match(live.stdout, /profiles: 1 found, 1 written, 2 image path\(s\) rewritten/);

  const target = createClient({ url: `file:${fixture.targetDbPath}` });
  const images = await target.execute(
    "SELECT slug, dinosaur_name, prompt, model, mime_type, extension, source, storage_key, byte_size FROM reward_images ORDER BY slug",
  );
  assert.deepEqual(
    images.rows.map((row) => [row.slug, row.dinosaur_name, row.prompt, row.model, row.mime_type, row.extension, row.source]),
    [
      [
        "hybrid-triceratops-velociraptor",
        "Hybrid Triceratops + Velociraptor",
        "legacy db prompt",
        "gpt-image-2",
        "image/jpeg",
        "jpg",
        "filesystem-migration",
      ],
      ["velociraptor", "Velociraptor", "sidecar prompt", "gemini-3-pro-image-preview", "image/png", "png", "filesystem-migration"],
    ],
  );
  const velociraptorRow = images.rows.find((row) => row.slug === "velociraptor");
  assert.equal(velociraptorRow.byte_size, Buffer.from("velociraptor-png-bytes").byteLength);
  const storedFiles = await readdir(path.join(fixture.storageDir, "rewards", "velociraptor"));
  assert.equal(storedFiles.length, 1);
  assert.equal(path.join("rewards", "velociraptor", storedFiles[0]), velociraptorRow.storage_key);

  const states = await target.execute("SELECT slug, status, current_image_id FROM reward_image_states ORDER BY slug");
  assert.deepEqual(
    states.rows.map((row) => [row.slug, row.status, row.current_image_id !== null]),
    [
      ["hybrid-triceratops-velociraptor", "ready", true],
      ["velociraptor", "ready", true],
    ],
  );

  const profiles = await target.execute("SELECT player_name_key, snapshot_json, updated_at_ms FROM player_profiles");
  assert.equal(profiles.rows.length, 1, "--player filter limits migrated profiles");
  assert.equal(profiles.rows[0].player_name_key, "gus");
  assert.equal(profiles.rows[0].updated_at_ms, 2000, "original timestamp preserved");
  const snapshot = JSON.parse(profiles.rows[0].snapshot_json);
  assert.match(snapshot.gameSession.unlockedRewards[0].imagePath, /^\/rewards\/velociraptor\.png\?v=\d+$/);
  assert.notEqual(snapshot.gameSession.unlockedRewards[0].imagePath, "/rewards/velociraptor.png?v=123");
  assert.match(snapshot.gameSession.unlockedHybrids[0].imagePath, /^\/rewards\/hybrid-triceratops-velociraptor\.jpg\?v=\d+$/);
  assert.equal(
    snapshot.gameSession.amberImagePath,
    "/rewards/amber-resonance-crystal.jpg?v=5",
    "paths without a migrated image are left untouched",
  );
  assert.match(live.stdout, /amber-resonance-crystal/);

  // Second run: nothing new is uploaded, profiles are re-written safely.
  const rerun = await runMigration([...baseArgs, "--allow-local-target"], env);
  assert.equal(rerun.code, 0, rerun.stderr);
  assert.match(rerun.stdout, /2 found, 0 uploaded, 2 already recorded, 0 failed/);
  assert.match(rerun.stdout, /profiles: 2 found, 2 written/);
  const imageCount = await target.execute("SELECT COUNT(*) AS n FROM reward_images");
  assert.equal(imageCount.rows[0].n, 2);
  const profileCount = await target.execute("SELECT COUNT(*) AS n FROM player_profiles");
  assert.equal(profileCount.rows[0].n, 2);
  target.close();
});
