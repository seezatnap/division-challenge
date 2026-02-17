import type { IsoDateString, UnlockedReward } from "@/features/contracts";

export const DINO_GALLERY_REWARDS_UPDATED_EVENT = "dino-gallery:rewards-updated";
const GALLERY_REWARD_UNLOCK_INTERVAL = 5 as const;

export interface DinoGalleryRewardsUpdatedEventDetail {
  unlockedRewards: UnlockedReward[];
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null;
}

function isUnlockedReward(value: unknown): value is UnlockedReward {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.rewardId === "string" &&
    typeof value.dinosaurName === "string" &&
    typeof value.imagePath === "string" &&
    typeof value.earnedAt === "string" &&
    Number.isInteger(value.milestoneSolvedCount)
  );
}

function cloneUnlockedReward(unlockedReward: UnlockedReward): UnlockedReward {
  return {
    ...unlockedReward,
  };
}

function normalizeUnlockedRewards(unlockedRewards: readonly UnlockedReward[]): UnlockedReward[] {
  if (!Array.isArray(unlockedRewards)) {
    throw new TypeError("unlockedRewards must be an array.");
  }

  return unlockedRewards.map((unlockedReward) => cloneUnlockedReward(unlockedReward));
}

function toSortableTimestamp(isoDateString: IsoDateString): number {
  const parsedTimestamp = Date.parse(isoDateString);
  return Number.isNaN(parsedTimestamp) ? 0 : parsedTimestamp;
}

function getRewardNumberFromMilestone(milestoneSolvedCount: number): number {
  if (!Number.isInteger(milestoneSolvedCount) || milestoneSolvedCount <= 0) {
    return 1;
  }

  return Math.max(1, Math.floor(milestoneSolvedCount / GALLERY_REWARD_UNLOCK_INTERVAL));
}

export function formatGalleryEarnedDate(earnedAt: IsoDateString): string {
  const earnedDate = new Date(earnedAt);

  if (Number.isNaN(earnedDate.getTime())) {
    return "Unknown date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(earnedDate);
}

export function sortUnlockedRewardsForGallery(
  unlockedRewards: readonly UnlockedReward[],
): UnlockedReward[] {
  return normalizeUnlockedRewards(unlockedRewards).sort((leftReward, rightReward) => {
    const milestoneSolvedDelta =
      rightReward.milestoneSolvedCount - leftReward.milestoneSolvedCount;
    if (milestoneSolvedDelta !== 0) {
      return milestoneSolvedDelta;
    }

    const earnedTimestampDelta =
      toSortableTimestamp(rightReward.earnedAt) - toSortableTimestamp(leftReward.earnedAt);
    if (earnedTimestampDelta !== 0) {
      return earnedTimestampDelta;
    }

    return leftReward.dinosaurName.localeCompare(rightReward.dinosaurName);
  });
}

export function mergeUnlockedRewardsForGallery(
  existingRewards: readonly UnlockedReward[],
  incomingRewards: readonly UnlockedReward[],
): UnlockedReward[] {
  const rewardById = new Map<string, UnlockedReward>();

  for (const reward of normalizeUnlockedRewards(existingRewards)) {
    rewardById.set(reward.rewardId, reward);
  }

  for (const reward of normalizeUnlockedRewards(incomingRewards)) {
    rewardById.set(reward.rewardId, reward);
  }

  return sortUnlockedRewardsForGallery(Array.from(rewardById.values()));
}

export function createGalleryRewardFromUnlock(input: {
  dinosaurName: string;
  imagePath: string;
  milestoneSolvedCount: number;
  earnedAt?: IsoDateString;
}): UnlockedReward {
  const rewardNumber = getRewardNumberFromMilestone(input.milestoneSolvedCount);
  const earnedAt = input.earnedAt ?? new Date().toISOString();

  return {
    rewardId: `reward-${rewardNumber}`,
    dinosaurName: input.dinosaurName,
    imagePath: input.imagePath,
    earnedAt,
    milestoneSolvedCount: input.milestoneSolvedCount,
  };
}

export function createDinoGalleryRewardsUpdatedEventDetail(
  unlockedRewards: readonly UnlockedReward[],
): DinoGalleryRewardsUpdatedEventDetail {
  return {
    unlockedRewards: normalizeUnlockedRewards(unlockedRewards),
  };
}

export function parseDinoGalleryRewardsUpdatedEventDetail(
  value: unknown,
): DinoGalleryRewardsUpdatedEventDetail | null {
  if (!isRecord(value) || !Array.isArray(value.unlockedRewards)) {
    return null;
  }

  const unlockedRewards: UnlockedReward[] = [];

  for (const unlockedReward of value.unlockedRewards) {
    if (!isUnlockedReward(unlockedReward)) {
      return null;
    }

    unlockedRewards.push(cloneUnlockedReward(unlockedReward));
  }

  return { unlockedRewards };
}

export function readUnlockedRewardsFromGalleryEvent(event: Event): UnlockedReward[] {
  if (!isRecord(event) || !("detail" in event)) {
    return [];
  }

  const eventDetail = (event as { detail?: unknown }).detail;
  const detail = parseDinoGalleryRewardsUpdatedEventDetail(eventDetail);
  return detail ? detail.unlockedRewards : [];
}

export function dispatchDinoGalleryRewardsUpdatedEvent(
  unlockedRewards: readonly UnlockedReward[],
  eventTarget: Pick<Window, "dispatchEvent"> | null = typeof window === "undefined" ? null : window,
): void {
  if (!eventTarget || typeof CustomEvent === "undefined") {
    return;
  }

  eventTarget.dispatchEvent(
    new CustomEvent<DinoGalleryRewardsUpdatedEventDetail>(
      DINO_GALLERY_REWARDS_UPDATED_EVENT,
      {
        detail: createDinoGalleryRewardsUpdatedEventDetail(unlockedRewards),
      },
    ),
  );
}
