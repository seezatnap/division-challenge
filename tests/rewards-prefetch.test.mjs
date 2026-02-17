import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

async function loadRewardPrefetchModule() {
  const dinosaursModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/dinosaurs.ts",
  );
  const imageCacheModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/gemini-image-cache.ts",
  );
  const prefetchModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/prefetch.ts",
    {
      "./dinosaurs": dinosaursModuleUrl,
      "./gemini-image-cache": imageCacheModuleUrl,
    },
  );

  return import(prefetchModuleUrl);
}

const rewardPrefetchModule = loadRewardPrefetchModule();

test("shouldTriggerNearMilestonePrefetch fires for problems 3 and 4 in each reward set of 5", async () => {
  const { shouldTriggerNearMilestonePrefetch } = await rewardPrefetchModule;

  assert.equal(shouldTriggerNearMilestonePrefetch({ totalProblemsSolved: 0 }), false);
  assert.equal(shouldTriggerNearMilestonePrefetch({ totalProblemsSolved: 1 }), false);
  assert.equal(shouldTriggerNearMilestonePrefetch({ totalProblemsSolved: 2 }), true);
  assert.equal(shouldTriggerNearMilestonePrefetch({ totalProblemsSolved: 3 }), true);
  assert.equal(shouldTriggerNearMilestonePrefetch({ totalProblemsSolved: 4 }), false);
  assert.equal(shouldTriggerNearMilestonePrefetch({ totalProblemsSolved: 7 }), true);
  assert.equal(shouldTriggerNearMilestonePrefetch({ totalProblemsSolved: 8 }), true);
});

test("resolveNearMilestonePrefetchTarget maps solved counts to deterministic next rewards", async () => {
  const { resolveNearMilestonePrefetchTarget } = await rewardPrefetchModule;

  assert.deepEqual(resolveNearMilestonePrefetchTarget(0), {
    rewardNumber: 1,
    dinosaurName: "Tyrannosaurus Rex",
    milestoneSolvedCount: 5,
    problemNumberWithinRewardInterval: 1,
  });
  assert.deepEqual(resolveNearMilestonePrefetchTarget(3), {
    rewardNumber: 1,
    dinosaurName: "Tyrannosaurus Rex",
    milestoneSolvedCount: 5,
    problemNumberWithinRewardInterval: 4,
  });
  assert.deepEqual(resolveNearMilestonePrefetchTarget(5), {
    rewardNumber: 2,
    dinosaurName: "Velociraptor",
    milestoneSolvedCount: 10,
    problemNumberWithinRewardInterval: 1,
  });
});

test("triggerNearMilestoneRewardPrefetch skips all work when not near a milestone trigger", async () => {
  const { triggerNearMilestoneRewardPrefetch } = await rewardPrefetchModule;
  let cacheCheckCount = 0;
  let prefetchCallCount = 0;

  const result = await triggerNearMilestoneRewardPrefetch(
    {
      totalProblemsSolved: 1,
      generateImage: async () => {
        assert.fail("generateImage should not be called when prefetch trigger is skipped");
      },
    },
    {
      doesRewardImageExistOnDisk: async () => {
        cacheCheckCount += 1;
        return false;
      },
      prefetchGeminiRewardImageWithFilesystemCache: async () => {
        prefetchCallCount += 1;
        return "started";
      },
    },
  );

  assert.equal(result.status, "skipped-not-near-milestone");
  assert.equal(cacheCheckCount, 0);
  assert.equal(prefetchCallCount, 0);
});

test("triggerNearMilestoneRewardPrefetch checks cache first and skips generation when image already exists", async () => {
  const { triggerNearMilestoneRewardPrefetch } = await rewardPrefetchModule;
  let cacheCheckCount = 0;
  let prefetchCallCount = 0;

  const result = await triggerNearMilestoneRewardPrefetch(
    {
      totalProblemsSolved: 2,
      generateImage: async () => {
        assert.fail("generateImage should not run when the image is already cached");
      },
    },
    {
      doesRewardImageExistOnDisk: async (dinosaurName) => {
        cacheCheckCount += 1;
        assert.equal(dinosaurName, "Tyrannosaurus Rex");
        return true;
      },
      prefetchGeminiRewardImageWithFilesystemCache: async () => {
        prefetchCallCount += 1;
        return "started";
      },
    },
  );

  assert.equal(result.status, "skipped-already-cached");
  assert.equal(cacheCheckCount, 1);
  assert.equal(prefetchCallCount, 0);
});

test("triggerNearMilestoneRewardPrefetch starts background generation only when uncached", async () => {
  const { triggerNearMilestoneRewardPrefetch } = await rewardPrefetchModule;
  let cacheCheckCount = 0;
  let prefetchCallCount = 0;

  const result = await triggerNearMilestoneRewardPrefetch(
    {
      totalProblemsSolved: 2,
      generateImage: async () => {
        assert.fail("prefetch trigger test should not execute background generator directly");
      },
    },
    {
      doesRewardImageExistOnDisk: async (dinosaurName) => {
        cacheCheckCount += 1;
        assert.equal(dinosaurName, "Tyrannosaurus Rex");
        return false;
      },
      prefetchGeminiRewardImageWithFilesystemCache: async (request) => {
        prefetchCallCount += 1;
        assert.deepEqual(request, { dinosaurName: "Tyrannosaurus Rex" });
        return "started";
      },
    },
  );

  assert.equal(result.status, "prefetch-started");
  assert.equal(cacheCheckCount, 1);
  assert.equal(prefetchCallCount, 1);
});

test("triggerNearMilestoneRewardPrefetch reports already-in-flight status when dedupe kicks in", async () => {
  const { triggerNearMilestoneRewardPrefetch } = await rewardPrefetchModule;

  const result = await triggerNearMilestoneRewardPrefetch(
    {
      totalProblemsSolved: 3,
      generateImage: async () => {
        assert.fail("prefetch trigger test should not execute background generator directly");
      },
    },
    {
      doesRewardImageExistOnDisk: async () => false,
      prefetchGeminiRewardImageWithFilesystemCache: async () => "already-in-flight",
    },
  );

  assert.equal(result.status, "prefetch-already-in-flight");
  assert.equal(result.target.problemNumberWithinRewardInterval, 4);
  assert.equal(result.target.rewardNumber, 1);
  assert.equal(result.target.dinosaurName, "Tyrannosaurus Rex");
});

test("triggerNearMilestoneRewardPrefetch reports skipped-already-cached when cache is filled during prefetch race", async () => {
  const { triggerNearMilestoneRewardPrefetch } = await rewardPrefetchModule;

  const result = await triggerNearMilestoneRewardPrefetch(
    {
      totalProblemsSolved: 3,
      generateImage: async () => {
        assert.fail("prefetch trigger test should not execute background generator directly");
      },
    },
    {
      doesRewardImageExistOnDisk: async () => false,
      prefetchGeminiRewardImageWithFilesystemCache: async () => "already-cached",
    },
  );

  assert.equal(result.status, "skipped-already-cached");
  assert.equal(result.target.problemNumberWithinRewardInterval, 4);
  assert.equal(result.target.rewardNumber, 1);
  assert.equal(result.target.dinosaurName, "Tyrannosaurus Rex");
});

test("prefetch helper validates trigger configuration", async () => {
  const { shouldTriggerNearMilestonePrefetch } = await rewardPrefetchModule;

  assert.throws(
    () =>
      shouldTriggerNearMilestonePrefetch({
        totalProblemsSolved: 2,
        unlockInterval: 5,
        prefetchProblemNumbers: [3, 6],
      }),
    /prefetchProblemNumbers entries must be less than or equal to unlockInterval/,
  );
});
