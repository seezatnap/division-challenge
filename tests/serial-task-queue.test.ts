import assert from "node:assert/strict";
import test from "node:test";

import { createSerialTaskQueue } from "../lib/serial-task-queue";

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

test("createSerialTaskQueue runs tasks in enqueue order", async () => {
  const queue = createSerialTaskQueue();
  const completionOrder: number[] = [];
  let firstTaskRunning = false;
  let secondTaskStartedBeforeFirstCompleted = false;

  const firstTask = queue.enqueue(async () => {
    firstTaskRunning = true;
    await delay(40);
    completionOrder.push(0);
    firstTaskRunning = false;
  });

  const secondTask = queue.enqueue(async () => {
    if (firstTaskRunning) {
      secondTaskStartedBeforeFirstCompleted = true;
    }

    completionOrder.push(1);
  });

  await Promise.all([firstTask, secondTask]);

  assert.equal(secondTaskStartedBeforeFirstCompleted, false);
  assert.deepEqual(completionOrder, [0, 1]);
});

test("createSerialTaskQueue preserves reward milestone order under mixed latencies", async () => {
  const queue = createSerialTaskQueue();
  const unlockedRewardNames: string[] = [];

  function queueRewardApplication(
    rewardIndex: number,
    rewardName: string,
    delayMilliseconds: number,
  ): Promise<void> {
    return queue.enqueue(async () => {
      await delay(delayMilliseconds);
      const unlockedCount = unlockedRewardNames.length;
      if (rewardIndex < unlockedCount) {
        return;
      }

      unlockedRewardNames.push(rewardName);
    });
  }

  const firstReward = queueRewardApplication(0, "Tyrannosaurus Rex", 40);
  const secondReward = queueRewardApplication(1, "Velociraptor", 0);

  await Promise.all([firstReward, secondReward]);

  assert.deepEqual(unlockedRewardNames, [
    "Tyrannosaurus Rex",
    "Velociraptor",
  ]);
});

test("createSerialTaskQueue clear drops queued tasks that have not started", async () => {
  const queue = createSerialTaskQueue();
  const executedTasks: string[] = [];

  const firstTask = queue.enqueue(async () => {
    executedTasks.push("first:start");
    await delay(40);
    executedTasks.push("first:end");
  });

  const secondTask = queue.enqueue(async () => {
    executedTasks.push("second");
  });

  queue.clear();

  await Promise.all([firstTask, secondTask]);

  assert.deepEqual(executedTasks, ["first:start", "first:end"]);
});
