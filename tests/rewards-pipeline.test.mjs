import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

function toDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function transpileTypeScriptToDataUrl(relativePath, replacements = {}) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");

  let compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;

  for (const [specifier, replacement] of Object.entries(replacements)) {
    compiled = compiled.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
    compiled = compiled.replaceAll(`from '${specifier}'`, `from "${replacement}"`);
  }

  return toDataUrl(compiled);
}

async function loadRewardPipelineModules() {
  const dinosaursModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/dinosaurs.ts",
  );
  const imageCacheModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/gemini-image-cache.ts",
  );
  const milestonesModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/milestones.ts",
    {
      "./dinosaurs": dinosaursModuleUrl,
      "./gemini-image-cache": imageCacheModuleUrl,
    },
  );
  const prefetchModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/prefetch.ts",
    {
      "./dinosaurs": dinosaursModuleUrl,
      "./gemini-image-cache": imageCacheModuleUrl,
    },
  );
  const revealModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/earned-reward-reveal.ts",
  );

  const [dinosaurs, geminiImageCache, milestones, prefetch, earnedRewardReveal] =
    await Promise.all([
      import(dinosaursModuleUrl),
      import(imageCacheModuleUrl),
      import(milestonesModuleUrl),
      import(prefetchModuleUrl),
      import(revealModuleUrl),
    ]);

  return {
    dinosaurs,
    geminiImageCache,
    milestones,
    prefetch,
    earnedRewardReveal,
  };
}

function createGeminiImage(dinosaurName, overrides = {}) {
  return {
    dinosaurName,
    prompt: `cinematic portrait of ${dinosaurName}`,
    model: "gemini-2.0-flash-exp",
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
  const { prefetch, geminiImageCache } = await rewardPipelineModules;

  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-pipeline-"));
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
    return createGeminiImage(dinosaurName);
  };

  const skippedResult = await prefetch.triggerNearMilestoneRewardPrefetch({
    totalProblemsSolved: 1,
    generateImage,
    cacheOptions: { outputDirectory: cacheDirectory },
  });
  assert.equal(skippedResult.status, "skipped-not-near-milestone");

  const startedResult = await prefetch.triggerNearMilestoneRewardPrefetch({
    totalProblemsSolved: 2,
    generateImage,
    cacheOptions: { outputDirectory: cacheDirectory },
  });
  assert.equal(startedResult.status, "prefetch-started");
  assert.equal(startedResult.target.dinosaurName, "Tyrannosaurus Rex");
  await generationStarted;

  const dedupedResult = await prefetch.triggerNearMilestoneRewardPrefetch({
    totalProblemsSolved: 3,
    generateImage,
    cacheOptions: { outputDirectory: cacheDirectory },
  });
  assert.equal(dedupedResult.status, "prefetch-already-in-flight");
  assert.equal(dedupedResult.target.dinosaurName, "Tyrannosaurus Rex");

  const generatingStatus = await geminiImageCache.getGeminiRewardImageGenerationStatus(
    "Tyrannosaurus Rex",
    { outputDirectory: cacheDirectory },
  );
  assert.deepEqual(generatingStatus, {
    dinosaurName: "Tyrannosaurus Rex",
    status: "generating",
    imagePath: null,
  });

  releaseGenerationGate();
  await geminiImageCache.resolveGeminiRewardImageWithFilesystemCache(
    { dinosaurName: "Tyrannosaurus Rex" },
    async () => {
      assert.fail("existing in-flight prefetch should satisfy resolve without another generator call");
    },
    { outputDirectory: cacheDirectory },
  );

  const readyStatus = await geminiImageCache.getGeminiRewardImageGenerationStatus(
    "Tyrannosaurus Rex",
    { outputDirectory: cacheDirectory },
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
  const { milestones, prefetch, geminiImageCache, earnedRewardReveal } = await rewardPipelineModules;

  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-pipeline-"));
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
    return createGeminiImage(dinosaurName);
  };

  const prefetchResult = await prefetch.triggerNearMilestoneRewardPrefetch({
    totalProblemsSolved: 2,
    generateImage,
    cacheOptions: { outputDirectory: cacheDirectory },
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
      geminiImageCache.getGeminiRewardImageGenerationStatus(dinosaurName, {
        outputDirectory: cacheDirectory,
      }),
    wait: async () => {
      waitInvocationCount += 1;
      if (waitInvocationCount === 1) {
        releaseGenerationGate();
        await geminiImageCache.resolveGeminiRewardImageWithFilesystemCache(
          { dinosaurName: earnedReward.dinosaurName },
          async () => {
            assert.fail("polling flow should reuse in-flight prefetch instead of generating a duplicate image");
          },
          { outputDirectory: cacheDirectory },
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
