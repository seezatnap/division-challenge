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

async function loadRewardMilestonesModule() {
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

  return import(milestonesModuleUrl);
}

const rewardMilestonesModule = loadRewardMilestonesModule();

function createUnlockedReward(overrides = {}) {
  return {
    rewardId: "reward-1",
    dinosaurName: "Tyrannosaurus Rex",
    imagePath: "/rewards/tyrannosaurus-rex.png",
    earnedAt: "2026-02-17T09:00:00.000Z",
    milestoneSolvedCount: 5,
    ...overrides,
  };
}

test("milestone helpers generate deterministic reward identifiers and image paths", async () => {
  const { createDeterministicRewardId, createDeterministicRewardImagePath } =
    await rewardMilestonesModule;

  assert.equal(createDeterministicRewardId(1), "reward-1");
  assert.equal(createDeterministicRewardId(2), "reward-2");
  assert.equal(
    createDeterministicRewardImagePath("Tyrannosaurus Rex"),
    "/rewards/tyrannosaurus-rex.png",
  );
});

test("resolveRewardMilestones unlocks nothing before the first 5-solve milestone", async () => {
  const { resolveRewardMilestones } = await rewardMilestonesModule;
  const result = resolveRewardMilestones({
    totalProblemsSolved: 4,
    unlockedRewards: [],
    now: () => new Date("2026-02-17T12:00:00.000Z"),
  });

  assert.equal(result.highestEarnedRewardNumber, 0);
  assert.equal(result.nextRewardNumber, 1);
  assert.equal(result.discardedOutOfOrderRewards, 0);
  assert.deepEqual(result.unlockedRewards, []);
  assert.deepEqual(result.newlyUnlockedRewards, []);
});

test("resolveRewardMilestones unlocks deterministic rewards at each 5-solve boundary", async () => {
  const { resolveRewardMilestones } = await rewardMilestonesModule;
  const result = resolveRewardMilestones({
    totalProblemsSolved: 5,
    unlockedRewards: [],
    now: () => new Date("2026-02-17T12:00:00.000Z"),
  });

  assert.equal(result.highestEarnedRewardNumber, 1);
  assert.equal(result.nextRewardNumber, 2);
  assert.equal(result.discardedOutOfOrderRewards, 0);
  assert.equal(result.newlyUnlockedRewards.length, 1);
  assert.deepEqual(result.newlyUnlockedRewards[0], {
    rewardId: "reward-1",
    dinosaurName: "Tyrannosaurus Rex",
    imagePath: "/rewards/tyrannosaurus-rex.png",
    earnedAt: "2026-02-17T12:00:00.000Z",
    milestoneSolvedCount: 5,
  });
});

test("resolveRewardMilestones catches up missed milestones in strict order for retry safety", async () => {
  const { resolveRewardMilestones } = await rewardMilestonesModule;
  const result = resolveRewardMilestones({
    totalProblemsSolved: 10,
    unlockedRewards: [],
    now: () => new Date("2026-02-17T12:30:00.000Z"),
  });

  assert.equal(result.highestEarnedRewardNumber, 2);
  assert.equal(result.nextRewardNumber, 3);
  assert.deepEqual(
    result.newlyUnlockedRewards.map((reward) => reward.dinosaurName),
    ["Tyrannosaurus Rex", "Velociraptor"],
  );
  assert.deepEqual(
    result.unlockedRewards.map((reward) => reward.milestoneSolvedCount),
    [5, 10],
  );
});

test("resolveRewardMilestones discards out-of-order trailing rewards and retries from first gap", async () => {
  const { resolveRewardMilestones, getContiguousRewardMilestonePrefixLength } =
    await rewardMilestonesModule;
  const outOfOrderRewards = [
    createUnlockedReward(),
    createUnlockedReward({
      rewardId: "reward-duplicate",
      dinosaurName: "Tyrannosaurus Rex",
      imagePath: "/rewards/duplicate.png",
      milestoneSolvedCount: 5,
    }),
  ];

  assert.equal(getContiguousRewardMilestonePrefixLength(outOfOrderRewards), 1);

  const result = resolveRewardMilestones({
    totalProblemsSolved: 10,
    unlockedRewards: outOfOrderRewards,
    now: () => new Date("2026-02-17T13:00:00.000Z"),
  });

  assert.equal(result.discardedOutOfOrderRewards, 1);
  assert.deepEqual(
    result.newlyUnlockedRewards.map((reward) => reward.dinosaurName),
    ["Velociraptor"],
  );
  assert.deepEqual(
    result.unlockedRewards.map((reward) => reward.dinosaurName),
    ["Tyrannosaurus Rex", "Velociraptor"],
  );
});

test("resolveRewardMilestones is idempotent once deterministic milestones are already unlocked", async () => {
  const { resolveRewardMilestones } = await rewardMilestonesModule;
  const existingUnlockedRewards = [
    createUnlockedReward(),
    createUnlockedReward({
      rewardId: "reward-2",
      dinosaurName: "Velociraptor",
      imagePath: "/rewards/velociraptor.png",
      milestoneSolvedCount: 10,
    }),
  ];

  const result = resolveRewardMilestones({
    totalProblemsSolved: 10,
    unlockedRewards: existingUnlockedRewards,
    now: () => new Date("2026-02-17T14:00:00.000Z"),
  });

  assert.deepEqual(result.newlyUnlockedRewards, []);
  assert.equal(result.discardedOutOfOrderRewards, 0);
  assert.equal(result.nextRewardNumber, 3);
  assert.notStrictEqual(result.unlockedRewards, existingUnlockedRewards);
  assert.notStrictEqual(result.unlockedRewards[0], existingUnlockedRewards[0]);
});

test("resolveRewardMilestones discards pre-existing rewards beyond the solved-count milestone ceiling", async () => {
  const { resolveRewardMilestones } = await rewardMilestonesModule;
  const existingUnlockedRewards = [
    createUnlockedReward(),
    createUnlockedReward({
      rewardId: "reward-2",
      dinosaurName: "Velociraptor",
      imagePath: "/rewards/velociraptor.png",
      milestoneSolvedCount: 10,
    }),
  ];

  const result = resolveRewardMilestones({
    totalProblemsSolved: 5,
    unlockedRewards: existingUnlockedRewards,
    now: () => new Date("2026-02-17T14:30:00.000Z"),
  });

  assert.equal(result.highestEarnedRewardNumber, 1);
  assert.equal(result.nextRewardNumber, 2);
  assert.equal(result.discardedOutOfOrderRewards, 1);
  assert.deepEqual(result.newlyUnlockedRewards, []);
  assert.deepEqual(
    result.unlockedRewards.map((reward) => reward.dinosaurName),
    ["Tyrannosaurus Rex"],
  );
});

test("resolveRewardMilestones clears all unlocked rewards when solved count is below the first milestone", async () => {
  const { resolveRewardMilestones } = await rewardMilestonesModule;
  const existingUnlockedRewards = [
    createUnlockedReward(),
    createUnlockedReward({
      rewardId: "reward-2",
      dinosaurName: "Velociraptor",
      imagePath: "/rewards/velociraptor.png",
      milestoneSolvedCount: 10,
    }),
  ];

  const result = resolveRewardMilestones({
    totalProblemsSolved: 0,
    unlockedRewards: existingUnlockedRewards,
    now: () => new Date("2026-02-17T14:45:00.000Z"),
  });

  assert.equal(result.highestEarnedRewardNumber, 0);
  assert.equal(result.nextRewardNumber, 1);
  assert.equal(result.discardedOutOfOrderRewards, 2);
  assert.deepEqual(result.newlyUnlockedRewards, []);
  assert.deepEqual(result.unlockedRewards, []);
});

test("milestone resolver validates numeric and timestamp input", async () => {
  const { createDeterministicRewardId, resolveRewardMilestones } =
    await rewardMilestonesModule;

  assert.throws(() => createDeterministicRewardId(0), /rewardNumber must be a positive integer/);
  assert.throws(
    () => resolveRewardMilestones({ totalProblemsSolved: -1, unlockedRewards: [] }),
    /totalProblemsSolved must be a non-negative integer/,
  );
  assert.throws(
    () =>
      resolveRewardMilestones({
        totalProblemsSolved: 5,
        unlockedRewards: [],
        earnedAt: "not-a-timestamp",
      }),
    /earnedAt must be a valid ISO timestamp/,
  );
});
