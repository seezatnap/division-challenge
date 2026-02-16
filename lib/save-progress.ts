import type { PlayerSaveFile } from "./domain";
import type { GameRuntimeState } from "./game-start";
import type { SerialTaskQueue } from "./serial-task-queue";

export interface SaveProgressAfterRewardMilestonesOptions<Result> {
  expectedRuntimeStateKey: string;
  getRuntimeState: () => GameRuntimeState | null;
  rewardMilestoneQueue: Pick<SerialTaskQueue, "enqueue">;
  persistPlayerSave: (saveFile: PlayerSaveFile) => Promise<Result>;
}

export function buildRuntimeStateKey(runtimeState: GameRuntimeState): string {
  return `${runtimeState.playerSave.playerName}:${runtimeState.initializedAt}`;
}

export function doesRuntimeStateMatchKey(
  runtimeState: GameRuntimeState | null,
  runtimeStateKey: string,
): runtimeState is GameRuntimeState {
  return runtimeState !== null && buildRuntimeStateKey(runtimeState) === runtimeStateKey;
}

export async function saveProgressAfterRewardMilestones<Result>(
  options: SaveProgressAfterRewardMilestonesOptions<Result>,
): Promise<Result | null> {
  await options.rewardMilestoneQueue.enqueue(async () => {});

  const latestRuntimeState = options.getRuntimeState();
  if (!doesRuntimeStateMatchKey(latestRuntimeState, options.expectedRuntimeStateKey)) {
    return null;
  }

  return options.persistPlayerSave(latestRuntimeState.playerSave);
}
