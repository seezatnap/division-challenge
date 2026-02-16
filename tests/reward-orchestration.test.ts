import assert from "node:assert/strict";
import test from "node:test";

import { createNewPlayerSave } from "../lib/domain";
import {
  orchestrateRewardUnlock,
  processPendingRewardMilestones,
  requestGeminiRewardImage,
} from "../lib/reward-orchestration";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

test("requestGeminiRewardImage posts dinosaur name and returns image path", async () => {
  let receivedUrl: RequestInfo | URL | undefined;
  let receivedInit: RequestInit | undefined;

  const fetchFn: typeof fetch = async (input, init) => {
    receivedUrl = input;
    receivedInit = init;

    return new Response(
      JSON.stringify({
        imagePath: "/generated-dinosaurs/tyrannosaurus-rex-abc123.png",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  };

  const response = await requestGeminiRewardImage({
    dinosaurName: "  Tyrannosaurus Rex  ",
    endpoint: "/api/test-gemini",
    fetchFn,
  });

  assert.equal(receivedUrl, "/api/test-gemini");
  assert.equal(receivedInit?.method, "POST");
  assert.equal(
    (receivedInit?.headers as Record<string, string> | undefined)?.[
      "Content-Type"
    ],
    "application/json",
  );
  assert.deepEqual(JSON.parse(String(receivedInit?.body)), {
    dinosaurName: "Tyrannosaurus Rex",
  });
  assert.equal(
    response.imagePath,
    "/generated-dinosaurs/tyrannosaurus-rex-abc123.png",
  );
});

test("requestGeminiRewardImage surfaces gemini route errors", async () => {
  const fetchFn: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        error: "Gemini unavailable",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );

  await assert.rejects(
    () =>
      requestGeminiRewardImage({
        dinosaurName: "Triceratops",
        fetchFn,
      }),
    /Gemini unavailable/,
  );
});

test("orchestrateRewardUnlock selects a dinosaur and appends unlocked metadata", async () => {
  let requestedDinosaurName = "";
  const save = createNewPlayerSave("Rex");
  const result = await orchestrateRewardUnlock({
    playerSave: save,
    rewardTrigger: {
      rewardIndex: 2,
      lifetimeSolvedCount: 15,
    },
    earnedAt: "2026-02-16T10:15:00.000Z",
    generateRewardImage: async (dinosaurName) => {
      requestedDinosaurName = dinosaurName;
      return {
        imagePath: `/generated-dinosaurs/${dinosaurName.toLowerCase().replace(/\s+/g, "-")}.png`,
      };
    },
  });

  assert.equal(result.dinosaurName, "Triceratops");
  assert.equal(requestedDinosaurName, "Triceratops");
  assert.equal(result.skipped, false);
  assert.equal(result.unlockedDinosaur?.name, "Triceratops");
  assert.equal(
    result.unlockedDinosaur?.imagePath,
    "/generated-dinosaurs/triceratops.png",
  );
  assert.equal(result.unlockedDinosaur?.earnedAt, "2026-02-16T10:15:00.000Z");
  assert.equal(result.playerSave.totalProblemsSolved, 15);
  assert.equal(result.playerSave.unlockedDinosaurs.length, 1);
});

test("orchestrateRewardUnlock skips duplicate reward triggers that were already unlocked", async () => {
  const save = createNewPlayerSave("Blue");
  save.unlockedDinosaurs.push({
    name: "Tyrannosaurus Rex",
    imagePath: "/generated-dinosaurs/trex.png",
    earnedAt: "2026-02-15T00:00:00.000Z",
  });
  save.unlockedDinosaurs.push({
    name: "Velociraptor",
    imagePath: "/generated-dinosaurs/velociraptor.png",
    earnedAt: "2026-02-15T01:00:00.000Z",
  });

  let called = false;
  const result = await orchestrateRewardUnlock({
    playerSave: save,
    rewardTrigger: {
      rewardIndex: 1,
      lifetimeSolvedCount: 10,
    },
    generateRewardImage: async () => {
      called = true;
      return { imagePath: "/generated-dinosaurs/unexpected.png" };
    },
  });

  assert.equal(called, false);
  assert.equal(result.skipped, true);
  assert.equal(result.unlockedDinosaur, null);
  assert.equal(result.playerSave, save);
});

test("orchestrateRewardUnlock validates reward trigger index integrity", async () => {
  const save = createNewPlayerSave("Charlie");

  await assert.rejects(
    () =>
      orchestrateRewardUnlock({
        playerSave: save,
        rewardTrigger: {
          rewardIndex: 3,
          lifetimeSolvedCount: 10,
        },
        generateRewardImage: async () => ({
          imagePath: "/generated-dinosaurs/unused.png",
        }),
      }),
    /does not match the solved-count milestone/,
  );
});

test("processPendingRewardMilestones retries failed milestones before newer milestones", async () => {
  const save = createNewPlayerSave("Delta");
  const requestedDinosaurNames: string[] = [];
  let shouldFailFirstTrexAttempt = true;

  const firstResult = await processPendingRewardMilestones({
    playerSave: save,
    highestRewardIndex: 0,
    generateRewardImage: async (dinosaurName) => {
      requestedDinosaurNames.push(dinosaurName);
      if (dinosaurName === "Tyrannosaurus Rex" && shouldFailFirstTrexAttempt) {
        shouldFailFirstTrexAttempt = false;
        throw new Error("Temporary Gemini failure");
      }

      return {
        imagePath: `/generated-dinosaurs/${dinosaurName.toLowerCase().replace(/\s+/g, "-")}.png`,
      };
    },
    earnedAt: "2026-02-16T14:00:00.000Z",
  });

  assert.equal(firstResult.failedRewardIndex, 0);
  assert.match(firstResult.errorMessage ?? "", /Temporary Gemini failure/);
  assert.equal(firstResult.playerSave.unlockedDinosaurs.length, 0);

  const secondResult = await processPendingRewardMilestones({
    playerSave: firstResult.playerSave,
    highestRewardIndex: 1,
    generateRewardImage: async (dinosaurName) => {
      requestedDinosaurNames.push(dinosaurName);
      return {
        imagePath: `/generated-dinosaurs/${dinosaurName.toLowerCase().replace(/\s+/g, "-")}.png`,
      };
    },
    earnedAt: "2026-02-16T14:01:00.000Z",
  });

  assert.equal(secondResult.failedRewardIndex, null);
  assert.equal(secondResult.errorMessage, null);
  assert.deepEqual(
    secondResult.playerSave.unlockedDinosaurs.map((dinosaur) => dinosaur.name),
    ["Tyrannosaurus Rex", "Velociraptor"],
  );
  assert.deepEqual(requestedDinosaurNames, [
    "Tyrannosaurus Rex",
    "Tyrannosaurus Rex",
    "Velociraptor",
  ]);
});

test("processPendingRewardMilestones keeps milestone unlocks ordered when later responses are faster", async () => {
  const save = createNewPlayerSave("Echo");
  const responseResolutionOrder: string[] = [];

  const result = await processPendingRewardMilestones({
    playerSave: save,
    highestRewardIndex: 1,
    generateRewardImage: async (dinosaurName) => {
      if (dinosaurName === "Tyrannosaurus Rex") {
        await delay(30);
      }

      responseResolutionOrder.push(dinosaurName);
      return {
        imagePath: `/generated-dinosaurs/${dinosaurName.toLowerCase().replace(/\s+/g, "-")}.png`,
      };
    },
    earnedAt: "2026-02-16T15:00:00.000Z",
  });

  assert.equal(result.failedRewardIndex, null);
  assert.equal(result.errorMessage, null);
  assert.deepEqual(
    result.playerSave.unlockedDinosaurs.map((dinosaur) => dinosaur.name),
    ["Tyrannosaurus Rex", "Velociraptor"],
  );
  assert.deepEqual(responseResolutionOrder, [
    "Tyrannosaurus Rex",
    "Velociraptor",
  ]);
});
