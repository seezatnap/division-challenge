import type { PlayerSaveFile, UnlockedDinosaur } from "./domain";
import { selectDinosaurByRewardIndex } from "./dinosaurs";
import {
  LONG_DIVISION_REWARD_INTERVAL,
  type LongDivisionWorkbenchRewardTrigger,
} from "./long-division-workbench";

export const GEMINI_IMAGE_ROUTE_PATH = "/api/gemini-image";

export interface RewardGenerationResponse {
  imagePath: string;
}

export type RewardImageGenerationFn = (
  dinosaurName: string,
) => Promise<RewardGenerationResponse>;

export interface RequestGeminiRewardImageOptions {
  dinosaurName: string;
  endpoint?: string;
  fetchFn?: typeof fetch;
}

export interface OrchestrateRewardUnlockOptions {
  playerSave: PlayerSaveFile;
  rewardTrigger: LongDivisionWorkbenchRewardTrigger;
  generateRewardImage?: RewardImageGenerationFn;
  earnedAt?: string;
}

export interface OrchestratedRewardUnlock {
  dinosaurName: string;
  unlockedDinosaur: UnlockedDinosaur | null;
  playerSave: PlayerSaveFile;
  skipped: boolean;
}

export interface ProcessPendingRewardMilestonesOptions {
  playerSave: PlayerSaveFile;
  highestRewardIndex: number;
  generateRewardImage?: RewardImageGenerationFn;
  earnedAt?: string;
}

export interface ProcessPendingRewardMilestonesResult {
  playerSave: PlayerSaveFile;
  unlockedDinosaurs: readonly UnlockedDinosaur[];
  failedRewardIndex: number | null;
  errorMessage: string | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeNonEmptyString(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Dinosaur reward generation failed.";
}

function assertRewardTriggerIntegrity(
  rewardTrigger: LongDivisionWorkbenchRewardTrigger,
): void {
  if (
    !Number.isInteger(rewardTrigger.rewardIndex) ||
    rewardTrigger.rewardIndex < 0
  ) {
    throw new Error("Reward trigger index must be a non-negative integer.");
  }

  if (
    !Number.isInteger(rewardTrigger.lifetimeSolvedCount) ||
    rewardTrigger.lifetimeSolvedCount <= 0
  ) {
    throw new Error(
      "Reward trigger lifetime solved count must be a positive integer.",
    );
  }

  if (
    rewardTrigger.lifetimeSolvedCount % LONG_DIVISION_REWARD_INTERVAL !== 0
  ) {
    throw new Error(
      `Reward triggers must occur every ${LONG_DIVISION_REWARD_INTERVAL} solved problems.`,
    );
  }

  const expectedRewardIndex =
    (rewardTrigger.lifetimeSolvedCount / LONG_DIVISION_REWARD_INTERVAL) - 1;
  if (expectedRewardIndex !== rewardTrigger.rewardIndex) {
    throw new Error(
      "Reward trigger index does not match the solved-count milestone.",
    );
  }
}

function buildRewardImageGenerationError(
  responsePayload: unknown,
  statusCode: number,
): Error {
  if (isObject(responsePayload) && typeof responsePayload.error === "string") {
    return new Error(responsePayload.error);
  }

  return new Error(
    `Dinosaur reward generation failed with status ${statusCode}.`,
  );
}

export async function requestGeminiRewardImage(
  options: RequestGeminiRewardImageOptions,
): Promise<RewardGenerationResponse> {
  const dinosaurName = normalizeNonEmptyString(
    options.dinosaurName,
    "Dinosaur name is required for reward generation.",
  );
  const endpoint = options.endpoint ?? GEMINI_IMAGE_ROUTE_PATH;
  const fetchFn = options.fetchFn ?? fetch;
  const response = await fetchFn(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ dinosaurName }),
  });

  let responsePayload: unknown = null;
  try {
    responsePayload = await response.json();
  } catch {
    responsePayload = null;
  }

  if (!response.ok) {
    throw buildRewardImageGenerationError(responsePayload, response.status);
  }

  if (
    !isObject(responsePayload) ||
    typeof responsePayload.imagePath !== "string" ||
    responsePayload.imagePath.trim().length === 0
  ) {
    throw new Error("Gemini image route returned an invalid imagePath.");
  }

  return {
    imagePath: responsePayload.imagePath.trim(),
  };
}

function assertHighestRewardIndex(highestRewardIndex: number): void {
  if (!Number.isInteger(highestRewardIndex) || highestRewardIndex < -1) {
    throw new Error(
      "Highest reward index must be an integer greater than or equal to -1.",
    );
  }
}

function buildRewardTriggerForIndex(
  rewardIndex: number,
): LongDivisionWorkbenchRewardTrigger {
  return {
    rewardIndex,
    lifetimeSolvedCount: (rewardIndex + 1) * LONG_DIVISION_REWARD_INTERVAL,
  };
}

export async function orchestrateRewardUnlock(
  options: OrchestrateRewardUnlockOptions,
): Promise<OrchestratedRewardUnlock> {
  assertRewardTriggerIntegrity(options.rewardTrigger);

  const dinosaurName = selectDinosaurByRewardIndex(options.rewardTrigger.rewardIndex);
  const rewardAlreadyUnlocked =
    options.rewardTrigger.rewardIndex < options.playerSave.unlockedDinosaurs.length;

  if (rewardAlreadyUnlocked) {
    return {
      dinosaurName,
      unlockedDinosaur: null,
      playerSave: options.playerSave,
      skipped: true,
    };
  }

  const generateRewardImage =
    options.generateRewardImage ??
    ((rewardDinosaurName: string) =>
      requestGeminiRewardImage({ dinosaurName: rewardDinosaurName }));

  let generatedImage: RewardGenerationResponse;
  try {
    generatedImage = await generateRewardImage(dinosaurName);
  } catch (error) {
    throw new Error(getErrorMessage(error));
  }

  const imagePath = normalizeNonEmptyString(
    generatedImage.imagePath,
    "Gemini reward image path must be a non-empty string.",
  );
  const earnedAt = options.earnedAt ?? new Date().toISOString();
  const unlockedDinosaur: UnlockedDinosaur = {
    name: dinosaurName,
    imagePath,
    earnedAt,
  };
  const playerSave: PlayerSaveFile = {
    ...options.playerSave,
    totalProblemsSolved: Math.max(
      options.playerSave.totalProblemsSolved,
      options.rewardTrigger.lifetimeSolvedCount,
    ),
    unlockedDinosaurs: [
      ...options.playerSave.unlockedDinosaurs,
      unlockedDinosaur,
    ],
  };

  return {
    dinosaurName,
    unlockedDinosaur,
    playerSave,
    skipped: false,
  };
}

export async function processPendingRewardMilestones(
  options: ProcessPendingRewardMilestonesOptions,
): Promise<ProcessPendingRewardMilestonesResult> {
  assertHighestRewardIndex(options.highestRewardIndex);

  let playerSave = options.playerSave;
  const unlockedDinosaurs: UnlockedDinosaur[] = [];
  const nextRewardIndex = playerSave.unlockedDinosaurs.length;

  if (nextRewardIndex > options.highestRewardIndex) {
    return {
      playerSave,
      unlockedDinosaurs,
      failedRewardIndex: null,
      errorMessage: null,
    };
  }

  for (
    let rewardIndex = nextRewardIndex;
    rewardIndex <= options.highestRewardIndex;
    rewardIndex += 1
  ) {
    const rewardTrigger = buildRewardTriggerForIndex(rewardIndex);

    try {
      const result = await orchestrateRewardUnlock({
        playerSave,
        rewardTrigger,
        generateRewardImage: options.generateRewardImage,
        earnedAt: options.earnedAt,
      });
      playerSave = result.playerSave;

      if (result.unlockedDinosaur) {
        unlockedDinosaurs.push(result.unlockedDinosaur);
      }
    } catch (error) {
      return {
        playerSave,
        unlockedDinosaurs,
        failedRewardIndex: rewardIndex,
        errorMessage: getErrorMessage(error),
      };
    }
  }

  return {
    playerSave,
    unlockedDinosaurs,
    failedRewardIndex: null,
    errorMessage: null,
  };
}
