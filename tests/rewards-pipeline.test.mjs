import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTypeScriptModule } from "../scripts/lib/load-typescript-module.mjs";

// Isolate the database used by this test file (the modules read the URL when
// the first query runs, so it must be set before any cache call).
const databaseDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-pipeline-db-"));
process.env.TURSO_DATABASE_URL = `file:${path.join(databaseDirectory, "pipeline.sqlite3")}`;

async function loadRewardPipelineModules() {
  const [dinosaurs, rewardImageCache, milestones, prefetch, earnedRewardReveal, objectStorage] =
    await Promise.all([
      loadTypeScriptModule("src/features/rewards/lib/dinosaurs.ts"),
      loadTypeScriptModule("src/features/rewards/lib/reward-image-cache.ts"),
      loadTypeScriptModule("src/features/rewards/lib/milestones.ts"),
      loadTypeScriptModule("src/features/rewards/lib/prefetch.ts"),
      loadTypeScriptModule("src/features/rewards/lib/earned-reward-reveal.ts"),
      loadTypeScriptModule("src/features/persistence/lib/object-storage.ts"),
    ]);

  return {
    dinosaurs,
    rewardImageCache,
    milestones,
    prefetch,
    earnedRewardReveal,
    objectStorage,
  };
}

function createGeneratedImage(dinosaurName, overrides = {}) {
  return {
    dinosaurName,
    prompt: `cinematic portrait of ${dinosaurName}`,
    model: "gpt-image-2",
    mimeType: "image/png",
    imageBase64: Buffer.from(`${dinosaurName}-reward-bytes`).toString("base64"),
    ...overrides,
  };
}

const rewardPipelineModules = loadRewardPipelineModules();

test("reward milestones trigger at 5-solve boundaries with deterministic dinosaur selection", async () => {
  const { milestones, dinosaurs } = await rewardPipelineModules;

  let unlockedRewards = [];
  const allNewlyUnlockedRewards = [];

  for (const totalProblemsSolved of [4, 5, 9, 10, 14, 15]) {
    const milestoneResult = milestones.resolveRewardMilestones({
      totalProblemsSolved,
      unlockedRewards,
      earnedAt: "2026-02-17T16:00:00.000Z",
    });
    unlockedRewards = milestoneResult.unlockedRewards;
    allNewlyUnlockedRewards.push(...milestoneResult.newlyUnlockedRewards);
  }

  assert.equal(allNewlyUnlockedRewards.length, 3);
  assert.deepEqual(
    allNewlyUnlockedRewards.map((reward) => reward.milestoneSolvedCount),
    [5, 10, 15],
  );
  assert.deepEqual(
    allNewlyUnlockedRewards.map((reward) => reward.dinosaurName),
    dinosaurs.getDeterministicUnlockOrder(1, 3),
  );
});

test("near-milestone prefetch checks cache, triggers once, and dedupes in-flight calls", async () => {
  const { prefetch, rewardImageCache, objectStorage } = await rewardPipelineModules;

  const storage = objectStorage.createInMemoryRewardImageStorage();
  let generatorInvocationCount = 0;
  let releaseGenerationGate = () => {};
  let markGenerationStarted = () => {};
  const generationGate = new Promise((resolve) => {
    releaseGenerationGate = resolve;
  });
  const generationStarted = new Promise((resolve) => {
    markGenerationStarted = resolve;
  });

  const generateImage = async ({ dinosaurName }) => {
    generatorInvocationCount += 1;
    markGenerationStarted();
    await generationGate;
    return createGeneratedImage(dinosaurName);
  };

  const skippedResult = await prefetch.triggerNearMilestoneRewardPrefetch({
    totalProblemsSolved: 1,
    generateImage,
    cacheOptions: { storage },
  });
  assert.equal(skippedResult.status, "skipped-not-near-milestone");

  const startedResult = await prefetch.triggerNearMilestoneRewardPrefetch({
    totalProblemsSolved: 2,
    generateImage,
    cacheOptions: { storage },
  });
  assert.equal(startedResult.status, "prefetch-started");
  assert.equal(startedResult.target.dinosaurName, "Tyrannosaurus Rex");
  await generationStarted;

  const dedupedResult = await prefetch.triggerNearMilestoneRewardPrefetch({
    totalProblemsSolved: 3,
    generateImage,
    cacheOptions: { storage },
  });
  assert.equal(dedupedResult.status, "prefetch-already-in-flight");
  assert.equal(dedupedResult.target.dinosaurName, "Tyrannosaurus Rex");

  const generatingStatus = await rewardImageCache.getRewardImageGenerationStatus(
    "Tyrannosaurus Rex",
    { storage },
  );
  assert.deepEqual(generatingStatus, {
    dinosaurName: "Tyrannosaurus Rex",
    status: "generating",
    imagePath: null,
  });

  releaseGenerationGate();
  await rewardImageCache.resolveRewardImageWithCache(
    { dinosaurName: "Tyrannosaurus Rex" },
    async () => {
      assert.fail("existing in-flight prefetch should satisfy resolve without another generator call");
    },
    { storage },
  );

  const readyStatus = await rewardImageCache.getRewardImageGenerationStatus(
    "Tyrannosaurus Rex",
    { storage },
  );
  assert.equal(readyStatus.dinosaurName, "Tyrannosaurus Rex");
  assert.equal(readyStatus.status, "ready");
  assert.ok(
    typeof readyStatus.imagePath === "string" &&
      readyStatus.imagePath.startsWith("/rewards/tyrannosaurus-rex.png?v="),
    `Expected cache-busted ready image path, received: ${readyStatus.imagePath}`,
  );
  assert.equal(generatorInvocationCount, 1);
});

test("earned reward reveal polling waits for in-flight prefetched generation and reveals the deterministic reward image", async () => {
  const { milestones, prefetch, rewardImageCache, earnedRewardReveal, objectStorage } =
    await rewardPipelineModules;

  const storage = objectStorage.createInMemoryRewardImageStorage();
  // The database is shared across this file's tests; start from a clean slate
  // for the deterministic first reward.
  await rewardImageCache.deleteRewardImageCacheEntry("Tyrannosaurus Rex", { storage });
  let releaseGenerationGate = () => {};
  let markGenerationStarted = () => {};
  const generationGate = new Promise((resolve) => {
    releaseGenerationGate = resolve;
  });
  const generationStarted = new Promise((resolve) => {
    markGenerationStarted = resolve;
  });

  const generateImage = async ({ dinosaurName }) => {
    markGenerationStarted();
    await generationGate;
    return createGeneratedImage(dinosaurName);
  };

  const prefetchResult = await prefetch.triggerNearMilestoneRewardPrefetch({
    totalProblemsSolved: 2,
    generateImage,
    cacheOptions: { storage },
  });
  assert.equal(prefetchResult.status, "prefetch-started");
  await generationStarted;

  const milestoneResult = milestones.resolveRewardMilestones({
    totalProblemsSolved: 5,
    unlockedRewards: [],
    earnedAt: "2026-02-17T16:30:00.000Z",
  });
  assert.equal(milestoneResult.newlyUnlockedRewards.length, 1);
  const [earnedReward] = milestoneResult.newlyUnlockedRewards;
  assert.equal(earnedReward.dinosaurName, prefetchResult.target.dinosaurName);

  let waitInvocationCount = 0;
  const revealResult = await earnedRewardReveal.pollEarnedRewardImageUntilReady({
    dinosaurName: earnedReward.dinosaurName,
    pollIntervalMs: 5,
    maxPollAttempts: 3,
    pollStatus: (dinosaurName) =>
      rewardImageCache.getRewardImageGenerationStatus(dinosaurName, { storage }),
    wait: async () => {
      waitInvocationCount += 1;
      if (waitInvocationCount === 1) {
        releaseGenerationGate();
        await rewardImageCache.resolveRewardImageWithCache(
          { dinosaurName: earnedReward.dinosaurName },
          async () => {
            assert.fail("polling flow should reuse in-flight prefetch instead of generating a duplicate image");
          },
          { storage },
        );
      }
    },
  });

  assert.equal(waitInvocationCount, 1);
  assert.equal(revealResult.outcome, "revealed");
  assert.equal(revealResult.attempts, 2);
  assert.equal(revealResult.snapshot.status, "ready");
  assert.equal(revealResult.snapshot.dinosaurName, earnedReward.dinosaurName);
  assert.ok(
    typeof revealResult.snapshot.imagePath === "string" &&
      revealResult.snapshot.imagePath.startsWith(`${earnedReward.imagePath}?v=`),
    `Expected revealed image path to include cache-buster, received: ${revealResult.snapshot.imagePath}`,
  );
});
