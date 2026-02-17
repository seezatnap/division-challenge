import type { IsoDateString, UnlockedReward } from "@/features/contracts";

import {
  REWARD_UNLOCK_INTERVAL,
  getDinosaurForRewardNumber,
  getMilestoneSolvedCountForRewardNumber,
  getRewardNumberForSolvedCount,
} from "./dinosaurs";
import { toRewardImageCacheSlug } from "./gemini-image-cache";

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

function defaultNow(): Date {
  return new Date();
}

function resolveEarnedAt(
  earnedAt: IsoDateString | undefined,
  now: (() => Date) | undefined,
): IsoDateString {
  if (typeof earnedAt === "string") {
    if (Number.isNaN(Date.parse(earnedAt))) {
      throw new Error("earnedAt must be a valid ISO timestamp.");
    }
    return earnedAt;
  }

  const timestamp = (now ?? defaultNow)();
  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    throw new Error("now must return a valid Date instance.");
  }

  return timestamp.toISOString();
}

function normalizeDinosaurName(dinosaurName: string): string {
  return dinosaurName.trim();
}

function cloneUnlockedRewards(unlockedRewards: readonly UnlockedReward[]): UnlockedReward[] {
  return unlockedRewards.map((reward) => ({ ...reward }));
}

export interface DeterministicUnlockedRewardInput {
  rewardNumber: number;
  earnedAt: IsoDateString;
}

export interface RewardMilestoneResolutionRequest {
  totalProblemsSolved: number;
  unlockedRewards: readonly UnlockedReward[];
  earnedAt?: IsoDateString;
  now?: () => Date;
}

export interface RewardMilestoneResolutionResult {
  unlockedRewards: UnlockedReward[];
  newlyUnlockedRewards: UnlockedReward[];
  highestEarnedRewardNumber: number;
  nextRewardNumber: number;
  discardedOutOfOrderRewards: number;
}

export function createDeterministicRewardId(rewardNumber: number): string {
  assertPositiveInteger(rewardNumber, "rewardNumber");
  return `reward-${rewardNumber}`;
}

export function createDeterministicRewardImagePath(dinosaurName: string): string {
  return `/rewards/${toRewardImageCacheSlug(dinosaurName)}.png`;
}

export function createDeterministicUnlockedReward(
  input: DeterministicUnlockedRewardInput,
): UnlockedReward {
  assertPositiveInteger(input.rewardNumber, "input.rewardNumber");
  const dinosaurName = getDinosaurForRewardNumber(input.rewardNumber);

  return {
    rewardId: createDeterministicRewardId(input.rewardNumber),
    dinosaurName,
    imagePath: createDeterministicRewardImagePath(dinosaurName),
    earnedAt: input.earnedAt,
    milestoneSolvedCount: getMilestoneSolvedCountForRewardNumber(
      input.rewardNumber,
      REWARD_UNLOCK_INTERVAL,
    ),
  };
}

export function getContiguousRewardMilestonePrefixLength(
  unlockedRewards: readonly UnlockedReward[],
): number {
  if (!Array.isArray(unlockedRewards)) {
    throw new TypeError("unlockedRewards must be an array.");
  }

  let contiguousPrefixLength = 0;

  for (const reward of unlockedRewards) {
    const expectedRewardNumber = contiguousPrefixLength + 1;
    const expectedMilestoneSolvedCount = getMilestoneSolvedCountForRewardNumber(
      expectedRewardNumber,
      REWARD_UNLOCK_INTERVAL,
    );
    const expectedDinosaurName = getDinosaurForRewardNumber(expectedRewardNumber);

    if (!Number.isInteger(reward.milestoneSolvedCount)) {
      break;
    }

    if (reward.milestoneSolvedCount !== expectedMilestoneSolvedCount) {
      break;
    }

    if (normalizeDinosaurName(reward.dinosaurName) !== expectedDinosaurName) {
      break;
    }

    contiguousPrefixLength += 1;
  }

  return contiguousPrefixLength;
}

export function resolveRewardMilestones(
  request: RewardMilestoneResolutionRequest,
): RewardMilestoneResolutionResult {
  assertNonNegativeInteger(request.totalProblemsSolved, "totalProblemsSolved");

  if (!Array.isArray(request.unlockedRewards)) {
    throw new TypeError("unlockedRewards must be an array.");
  }

  const highestEarnedRewardNumber = getRewardNumberForSolvedCount(
    request.totalProblemsSolved,
    REWARD_UNLOCK_INTERVAL,
  );
  const contiguousPrefixLength = getContiguousRewardMilestonePrefixLength(request.unlockedRewards);
  const unlockedRewards = cloneUnlockedRewards(request.unlockedRewards.slice(0, contiguousPrefixLength));
  const newlyUnlockedRewards: UnlockedReward[] = [];

  if (highestEarnedRewardNumber > contiguousPrefixLength) {
    const earnedAt = resolveEarnedAt(request.earnedAt, request.now);

    for (
      let rewardNumber = contiguousPrefixLength + 1;
      rewardNumber <= highestEarnedRewardNumber;
      rewardNumber += 1
    ) {
      const unlockedReward = createDeterministicUnlockedReward({
        rewardNumber,
        earnedAt,
      });
      unlockedRewards.push(unlockedReward);
      newlyUnlockedRewards.push(unlockedReward);
    }
  }

  return {
    unlockedRewards,
    newlyUnlockedRewards,
    highestEarnedRewardNumber,
    nextRewardNumber: unlockedRewards.length + 1,
    discardedOutOfOrderRewards: request.unlockedRewards.length - contiguousPrefixLength,
  };
}
