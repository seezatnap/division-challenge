import assert from "node:assert/strict";
import test from "node:test";

import type { PlayerSaveFile } from "../lib/domain";
import { initializeNewGameRuntimeState } from "../lib/game-start";
import {
  buildRuntimeStateKey,
  saveProgressAfterRewardMilestones,
} from "../lib/save-progress";
import { createSerialTaskQueue } from "../lib/serial-task-queue";

function createDeferred(): {
  promise: Promise<void>;
  resolve: () => void;
} {
  let resolvePromise: (() => void) | null = null;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });

  return {
    promise,
    resolve(): void {
      resolvePromise?.();
    },
  };
}

test(
  "saveProgressAfterRewardMilestones waits for in-flight reward updates before persisting",
  async () => {
    const rewardMilestoneQueue = createSerialTaskQueue();
    let runtimeState = initializeNewGameRuntimeState(
      "Rex",
      "2026-02-16T10:00:00.000Z",
    );
    const runtimeStateKey = buildRuntimeStateKey(runtimeState);
    const rewardTaskStarted = createDeferred();
    const releaseRewardTask = createDeferred();

    const rewardTask = rewardMilestoneQueue.enqueue(async () => {
      rewardTaskStarted.resolve();
      await releaseRewardTask.promise;
      runtimeState = {
        ...runtimeState,
        playerSave: {
          ...runtimeState.playerSave,
          totalProblemsSolved: 5,
          unlockedDinosaurs: [
            ...runtimeState.playerSave.unlockedDinosaurs,
            {
              name: "Tyrannosaurus Rex",
              imagePath: "/generated-dinosaurs/tyrannosaurus-rex.png",
              earnedAt: "2026-02-16T10:05:00.000Z",
            },
          ],
        },
      };
    });

    await rewardTaskStarted.promise;

    let persistCallCount = 0;
    const savePromise = saveProgressAfterRewardMilestones({
      expectedRuntimeStateKey: runtimeStateKey,
      getRuntimeState: () => runtimeState,
      rewardMilestoneQueue,
      persistPlayerSave: async (saveFile) => {
        persistCallCount += 1;
        return {
          fileName: "rex-save.json",
          json: JSON.stringify(saveFile),
        };
      },
    });

    await Promise.resolve();
    assert.equal(persistCallCount, 0);

    releaseRewardTask.resolve();

    const saveResult = await savePromise;
    await rewardTask;

    assert.ok(saveResult);
    assert.equal(saveResult.fileName, "rex-save.json");
    const persistedPayload = JSON.parse(saveResult.json) as PlayerSaveFile;
    assert.equal(persistedPayload.totalProblemsSolved, 5);
    assert.deepEqual(
      persistedPayload.unlockedDinosaurs.map((dinosaur) => dinosaur.name),
      ["Tyrannosaurus Rex"],
    );
  },
);
