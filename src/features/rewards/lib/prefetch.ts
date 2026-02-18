import {
  REWARD_UNLOCK_INTERVAL,
  getDinosaurForRewardNumber,
  getMilestoneSolvedCountForRewardNumber,
  getRewardNumberForSolvedCount,
} from "./dinosaurs";
import {
  doesRewardImageExistOnDisk,
  prefetchGeminiRewardImageWithFilesystemCache,
  type FilesystemGeminiImageCacheOptions,
} from "./gemini-image-cache";
import type { GeminiGeneratedImage, GeminiImageGenerationRequest } from "./gemini-image-service";

export const NEAR_MILESTONE_PREFETCH_PROBLEM_NUMBERS = [3, 4] as const;

function assertNonNegativeInteger(value: number, argumentName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${argumentName} must be a non-negative integer.`);
  }
}

function assertPositiveInteger(value: number, argumentName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${argumentName} must be a positive integer.`);
  }
}

function assertPrefetchProblemNumbers(
  prefetchProblemNumbers: readonly number[],
  unlockInterval: number,
): void {
  for (const problemNumber of prefetchProblemNumbers) {
    assertPositiveInteger(problemNumber, "prefetchProblemNumbers entries");

    if (problemNumber > unlockInterval) {
      throw new RangeError(
        "prefetchProblemNumbers entries must be less than or equal to unlockInterval.",
      );
    }
  }
}

export function getProblemNumberWithinRewardInterval(
  totalProblemsSolved: number,
  unlockInterval: number = REWARD_UNLOCK_INTERVAL,
): number {
  assertNonNegativeInteger(totalProblemsSolved, "totalProblemsSolved");
  assertPositiveInteger(unlockInterval, "unlockInterval");

  return (totalProblemsSolved % unlockInterval) + 1;
}

export interface NearMilestonePrefetchTarget {
  rewardNumber: number;
  dinosaurName: string;
  milestoneSolvedCount: number;
  problemNumberWithinRewardInterval: number;
}

export interface ShouldTriggerNearMilestonePrefetchRequest {
  totalProblemsSolved: number;
  unlockInterval?: number;
  prefetchProblemNumbers?: readonly number[];
}

export function shouldTriggerNearMilestonePrefetch(
  request: ShouldTriggerNearMilestonePrefetchRequest,
): boolean {
  const unlockInterval = request.unlockInterval ?? REWARD_UNLOCK_INTERVAL;
  assertPositiveInteger(unlockInterval, "unlockInterval");

  const prefetchProblemNumbers =
    request.prefetchProblemNumbers ?? NEAR_MILESTONE_PREFETCH_PROBLEM_NUMBERS;
  assertPrefetchProblemNumbers(prefetchProblemNumbers, unlockInterval);

  const problemNumberWithinRewardInterval = getProblemNumberWithinRewardInterval(
    request.totalProblemsSolved,
    unlockInterval,
  );
  return prefetchProblemNumbers.includes(problemNumberWithinRewardInterval);
}

export function resolveNearMilestonePrefetchTarget(
  totalProblemsSolved: number,
  unlockInterval: number = REWARD_UNLOCK_INTERVAL,
): NearMilestonePrefetchTarget {
  const rewardNumber = getRewardNumberForSolvedCount(totalProblemsSolved, unlockInterval) + 1;
  const dinosaurName = getDinosaurForRewardNumber(rewardNumber);

  return {
    rewardNumber,
    dinosaurName,
    milestoneSolvedCount: getMilestoneSolvedCountForRewardNumber(rewardNumber, unlockInterval),
    problemNumberWithinRewardInterval: getProblemNumberWithinRewardInterval(
      totalProblemsSolved,
      unlockInterval,
    ),
  };
}

export type NearMilestoneRewardPrefetchStatus =
  | "skipped-not-near-milestone"
  | "skipped-already-cached"
  | "prefetch-already-in-flight"
  | "prefetch-started";

export interface TriggerNearMilestoneRewardPrefetchRequest {
  totalProblemsSolved: number;
  generateImage: (request: GeminiImageGenerationRequest) => Promise<GeminiGeneratedImage>;
  unlockInterval?: number;
  prefetchProblemNumbers?: readonly number[];
  cacheOptions?: FilesystemGeminiImageCacheOptions;
}

export interface TriggerNearMilestoneRewardPrefetchDependencies {
  doesRewardImageExistOnDisk: typeof doesRewardImageExistOnDisk;
  prefetchGeminiRewardImageWithFilesystemCache: typeof prefetchGeminiRewardImageWithFilesystemCache;
}

export interface TriggerNearMilestoneRewardPrefetchResult {
  status: NearMilestoneRewardPrefetchStatus;
  target: NearMilestonePrefetchTarget;
}

const defaultTriggerNearMilestoneRewardPrefetchDependencies: TriggerNearMilestoneRewardPrefetchDependencies =
  {
    doesRewardImageExistOnDisk,
    prefetchGeminiRewardImageWithFilesystemCache,
  };

export async function triggerNearMilestoneRewardPrefetch(
  request: TriggerNearMilestoneRewardPrefetchRequest,
  dependencies: TriggerNearMilestoneRewardPrefetchDependencies = defaultTriggerNearMilestoneRewardPrefetchDependencies,
): Promise<TriggerNearMilestoneRewardPrefetchResult> {
  const unlockInterval = request.unlockInterval ?? REWARD_UNLOCK_INTERVAL;
  const target = resolveNearMilestonePrefetchTarget(request.totalProblemsSolved, unlockInterval);
  const shouldTrigger = shouldTriggerNearMilestonePrefetch({
    totalProblemsSolved: request.totalProblemsSolved,
    unlockInterval,
    prefetchProblemNumbers: request.prefetchProblemNumbers,
  });

  if (!shouldTrigger) {
    return {
      status: "skipped-not-near-milestone",
      target,
    };
  }

  const cacheOptions = request.cacheOptions ?? {};
  const rewardImageExistsOnDisk = await dependencies.doesRewardImageExistOnDisk(
    target.dinosaurName,
    cacheOptions,
  );

  if (rewardImageExistsOnDisk) {
    return {
      status: "skipped-already-cached",
      target,
    };
  }

  const prefetchStatus = await dependencies.prefetchGeminiRewardImageWithFilesystemCache(
    { dinosaurName: target.dinosaurName },
    request.generateImage,
    cacheOptions,
  );

  if (prefetchStatus === "already-cached") {
    return {
      status: "skipped-already-cached",
      target,
    };
  }

  return {
    status: prefetchStatus === "started" ? "prefetch-started" : "prefetch-already-in-flight",
    target,
  };
}
