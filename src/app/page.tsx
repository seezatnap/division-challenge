"use client";

import Image from "next/image";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import {
  generateDivisionProblem,
  getDigitCount,
  solveLongDivision,
  type LongDivisionStepValidationResult,
} from "@/features/division-engine";
import {
  generateMultiplicationProblem,
  solveLongMultiplication,
} from "@/features/multiplication-engine";
import { DinoGalleryPanel } from "@/features/gallery/components/dino-gallery-panel";
import { ScrollIndicators } from "@/features/gallery/components/scroll-indicators";
import { IslaSornaToolbar } from "./isla-sorna-toolbar";
import {
  type ActiveInputLane,
  type DivisionProblem,
  type GameMode,
  type LongDivisionStep,
  type LongMultiplicationStep,
  type MultiplicationProblem,
  type UnlockedHybridReward,
  type UnlockedReward,
  type WorkspaceStep,
} from "@/features/contracts";
import { EarnedRewardRevealPanel } from "@/features/rewards/components/earned-reward-reveal-panel";
import {
  fetchEarnedRewardImageStatus,
  type EarnedRewardImageStatus,
} from "@/features/rewards/lib/earned-reward-reveal";
import {
  REWARD_UNLOCK_INTERVAL,
  getDinosaurForRewardNumber,
  getMilestoneSolvedCountForRewardNumber,
} from "@/features/rewards/lib/dinosaurs";
import { NANO_BANANA_PRO_IMAGE_MODEL } from "@/features/rewards/lib/gemini";
import {
  buildHybridDinosaurDossier,
  formatMetersAsMetersAndFeet,
  parseRewardDinosaurDossierArtifact,
  toHybridRewardDossierArtifactPath,
  type RewardDinosaurDossier,
} from "@/features/rewards/lib/dino-dossiers";
import { LiveDivisionWorkspacePanel } from "@/features/workspace-ui/components/live-division-workspace-panel";
import { LiveMultiplicationWorkspacePanel } from "@/features/workspace-ui/components/live-multiplication-workspace-panel";
import {
  fetchPlayerProfileSnapshot,
  normalizePlayerProfileName,
  readPlayerProfileSnapshot,
  savePlayerProfileSnapshot,
  writePlayerProfileSnapshot,
} from "@/features/persistence/lib";

const PROVISIONAL_REWARD_IMAGE_PATH = "/window.svg";

const workspacePreviewProblem: DivisionProblem = {
  id: "workspace-preview-problem",
  dividend: 4320,
  divisor: 12,
  allowRemainder: false,
  difficultyLevel: 1,
};

const workspacePreviewSolution = solveLongDivision(workspacePreviewProblem);

export type GameModeChoice = GameMode | "mixed";
export type DifficultyChoice = "easy" | "medium" | "hard";

type LiveWorkspaceProblem = DivisionProblem | MultiplicationProblem;

function isMultiplicationProblem(
  problem: LiveWorkspaceProblem,
): problem is MultiplicationProblem {
  return "multiplicand" in problem;
}

interface SolvedCountByMode {
  division: number;
  multiplication: number;
}

interface LiveGameSessionState {
  activeMode: GameMode;
  activeProblem: LiveWorkspaceProblem;
  steps: readonly WorkspaceStep[];
  sessionSolvedProblems: number;
  sessionAttemptedProblems: number;
  currentStreak: number;
  totalProblemsSolved: number;
  totalProblemsAttempted: number;
  solvedByMode: SolvedCountByMode;
  preferredGameMode: GameModeChoice;
  preferredDifficulty: DifficultyChoice;
  amberBalance: number;
  amberImagePath: string | null;
  unlockedRewards: readonly UnlockedReward[];
  unlockedHybrids: readonly UnlockedHybridReward[];
}

interface ActiveRewardRevealState {
  dinosaurName: string;
  milestoneSolvedCount: number;
  initialStatus: EarnedRewardImageStatus;
  initialImagePath: string | null;
}

interface PersistedPlayerGameSessionSnapshot {
  totalProblemsSolved: number;
  totalProblemsAttempted: number;
  currentStreak: number;
  solvedByMode: SolvedCountByMode;
  preferredGameMode: GameModeChoice;
  preferredDifficulty: DifficultyChoice;
  amberBalance: number;
  amberImagePath: string | null;
  unlockedRewards: readonly UnlockedReward[];
  unlockedHybrids: readonly UnlockedHybridReward[];
}

interface PersistedPlayerProfileSnapshot {
  gameSession: PersistedPlayerGameSessionSnapshot;
  activeRewardReveal: ActiveRewardRevealState;
}

const INITIAL_TOTAL_PROBLEMS_SOLVED = 0;
const INITIAL_TOTAL_PROBLEMS_ATTEMPTED = 0;
const INITIAL_SESSION_PROBLEMS_SOLVED = 0;
const INITIAL_SESSION_PROBLEMS_ATTEMPTED = 0;
const AMBER_COST_PER_DINO_UNLOCK = 10;
const AMBER_COST_PER_HYBRID_CREATION = 8;
const AMBER_REWARD_ASSET_NAME = "Amber Resonance Crystal";
const LIVE_PROBLEM_MIN_DIVISOR = 3;
const LIVE_PROBLEM_MAX_DIVISOR = 12;
const LIVE_PROBLEM_DIVIDEND_DIGITS = 4;
const LIVE_PROBLEM_MAX_GENERATION_ATTEMPTS = 180;
const LIVE_PROBLEM_FIXED_DIFFICULTY_LEVEL = 3;

function toRewardImageSlug(dinosaurName: string): string {
  const slug = dinosaurName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "reward-image";
}

function toRewardImageExtensionFromMimeType(mimeType: string | null): string {
  if (!mimeType) {
    return "png";
  }

  const normalizedMimeType = mimeType.trim().toLowerCase();
  if (normalizedMimeType === "image/svg+xml") {
    return "svg";
  }
  if (normalizedMimeType === "image/webp") {
    return "webp";
  }
  if (normalizedMimeType === "image/gif") {
    return "gif";
  }
  if (normalizedMimeType === "image/jpeg" || normalizedMimeType === "image/jpg") {
    return "jpg";
  }

  return "png";
}

function toRewardImagePathFromMimeType(
  dinosaurName: string,
  mimeType: string | null,
): string {
  return `/rewards/${toRewardImageSlug(dinosaurName)}.${toRewardImageExtensionFromMimeType(mimeType)}`;
}

function toNonNegativeInteger(value: unknown): number {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    return 0;
  }

  return Math.max(0, Number(value));
}

function toTrimmedValue(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

const GAME_MODE_CHOICE_OPTIONS: readonly { value: GameModeChoice; label: string }[] = [
  { value: "division", label: "Division" },
  { value: "multiplication", label: "Multiplication" },
  { value: "mixed", label: "Mixed Ops" },
];

const ENGINE_LEVEL_BY_DIFFICULTY: Record<DifficultyChoice, number> = {
  easy: 1,
  medium: 3,
  hard: 5,
};

const AMBER_EARNED_BY_DIFFICULTY: Record<DifficultyChoice, number> = {
  easy: 1,
  medium: 2,
  hard: 4,
};

const DIFFICULTY_CHOICE_OPTIONS: readonly {
  value: DifficultyChoice;
  label: string;
}[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

function toGameModeChoice(value: unknown): GameModeChoice {
  return value === "multiplication" || value === "mixed" ? value : "division";
}

function toDifficultyChoice(value: unknown): DifficultyChoice {
  if (value === "easy" || value === "medium" || value === "hard") {
    return value;
  }

  // Legacy profiles stored a numeric engine level (1-5); map it onto the bands.
  if (typeof value === "number" && Number.isInteger(value)) {
    if (value >= 4) {
      return "hard";
    }
    if (value === 3) {
      return "medium";
    }
  }

  return "easy";
}

function toSolvedCountByMode(
  value: unknown,
  fallbackDivisionSolvedCount: number,
): SolvedCountByMode {
  const record = (value && typeof value === "object" ? value : {}) as Partial<SolvedCountByMode>;

  return {
    division: toNonNegativeInteger(record.division ?? fallbackDivisionSolvedCount),
    multiplication: toNonNegativeInteger(record.multiplication),
  };
}

function normalizeHybridPair(input: {
  firstDinosaurName: string;
  secondDinosaurName: string;
}): { firstDinosaurName: string; secondDinosaurName: string } {
  const normalizedPair = [
    input.firstDinosaurName.trim(),
    input.secondDinosaurName.trim(),
  ].sort((leftName, rightName) => leftName.localeCompare(rightName, "en", { sensitivity: "base" }));

  return {
    firstDinosaurName: normalizedPair[0],
    secondDinosaurName: normalizedPair[1],
  };
}

function createHybridPairKey(input: {
  firstDinosaurName: string;
  secondDinosaurName: string;
}): string {
  const normalizedPair = normalizeHybridPair(input);
  return `${normalizedPair.firstDinosaurName.toLowerCase()}::${normalizedPair.secondDinosaurName.toLowerCase()}`;
}

function createHybridGenerationAssetName(input: {
  firstDinosaurName: string;
  secondDinosaurName: string;
}): string {
  const normalizedPair = normalizeHybridPair(input);
  return `Hybrid ${normalizedPair.firstDinosaurName} + ${normalizedPair.secondDinosaurName}`;
}

function createHybridDisplayName(input: {
  firstDinosaurName: string;
  secondDinosaurName: string;
}): string {
  const normalizedPair = normalizeHybridPair(input);
  return `${normalizedPair.firstDinosaurName} × ${normalizedPair.secondDinosaurName}`;
}

function createHybridId(pairKey: string): string {
  const sanitizedPairKey = pairKey.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `hybrid-${sanitizedPairKey || "entry"}`;
}

function isUnlockedHybridReward(value: unknown): value is UnlockedHybridReward {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<UnlockedHybridReward>;
  return (
    typeof candidate.hybridId === "string" &&
    typeof candidate.hybridName === "string" &&
    typeof candidate.pairKey === "string" &&
    typeof candidate.firstDinosaurName === "string" &&
    typeof candidate.secondDinosaurName === "string" &&
    typeof candidate.generationAssetName === "string" &&
    typeof candidate.imagePath === "string" &&
    typeof candidate.createdAt === "string"
  );
}

function resolveUnlockedPrimaryDinosaurNames(unlockedRewards: readonly UnlockedReward[]): string[] {
  const uniqueNames = new Set<string>();
  for (const unlockedReward of unlockedRewards) {
    const normalizedName = unlockedReward.dinosaurName.trim();
    if (normalizedName.length === 0) {
      continue;
    }

    uniqueNames.add(normalizedName);
  }

  return Array.from(uniqueNames).sort((leftName, rightName) =>
    leftName.localeCompare(rightName, "en", { sensitivity: "base" }),
  );
}

function resolveAvailableHybridSecondDinosaurNames(input: {
  firstDinosaurName: string;
  unlockedPrimaryDinosaurNames: readonly string[];
  unlockedHybrids: readonly UnlockedHybridReward[];
}): string[] {
  const normalizedFirstDinosaurName = input.firstDinosaurName.trim();
  if (normalizedFirstDinosaurName.length === 0) {
    return [];
  }

  const unlockedHybridPairKeys = new Set(
    input.unlockedHybrids.map((hybridReward) => hybridReward.pairKey.toLowerCase()),
  );

  return input.unlockedPrimaryDinosaurNames.filter((candidateDinosaurName) => {
    if (candidateDinosaurName === normalizedFirstDinosaurName) {
      return false;
    }

    return !unlockedHybridPairKeys.has(
      createHybridPairKey({
        firstDinosaurName: normalizedFirstDinosaurName,
        secondDinosaurName: candidateDinosaurName,
      }),
    );
  });
}

function hasAnyAvailableHybridPairs(
  unlockedPrimaryDinosaurNames: readonly string[],
  unlockedHybrids: readonly UnlockedHybridReward[],
): boolean {
  if (unlockedPrimaryDinosaurNames.length < 2) {
    return false;
  }

  const unlockedHybridPairKeys = new Set(
    unlockedHybrids.map((hybridReward) => hybridReward.pairKey.toLowerCase()),
  );

  for (let leftIndex = 0; leftIndex < unlockedPrimaryDinosaurNames.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < unlockedPrimaryDinosaurNames.length;
      rightIndex += 1
    ) {
      const pairKey = createHybridPairKey({
        firstDinosaurName: unlockedPrimaryDinosaurNames[leftIndex],
        secondDinosaurName: unlockedPrimaryDinosaurNames[rightIndex],
      });

      if (!unlockedHybridPairKeys.has(pairKey)) {
        return true;
      }
    }
  }

  return false;
}

function isUnlockedReward(value: unknown): value is UnlockedReward {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<UnlockedReward>;
  return (
    typeof candidate.rewardId === "string" &&
    typeof candidate.dinosaurName === "string" &&
    typeof candidate.imagePath === "string" &&
    typeof candidate.earnedAt === "string" &&
    typeof candidate.milestoneSolvedCount === "number"
  );
}

function normalizeUnlockedRewardsForSession(unlockedRewards: unknown): UnlockedReward[] {
  if (!Array.isArray(unlockedRewards)) {
    return [];
  }

  const rewardById = new Map<string, UnlockedReward>();
  for (const unlockedReward of unlockedRewards) {
    if (!isUnlockedReward(unlockedReward)) {
      continue;
    }

    const rewardId = toTrimmedValue(unlockedReward.rewardId);
    const dinosaurName = toTrimmedValue(unlockedReward.dinosaurName);
    const imagePath = toTrimmedValue(unlockedReward.imagePath);
    const earnedAt = toTrimmedValue(unlockedReward.earnedAt);
    const milestoneSolvedCount = toNonNegativeInteger(unlockedReward.milestoneSolvedCount);
    if (!rewardId || !dinosaurName || !imagePath || !earnedAt) {
      continue;
    }

    rewardById.set(rewardId, {
      rewardId,
      dinosaurName,
      imagePath,
      earnedAt,
      milestoneSolvedCount,
    });
  }

  return Array.from(rewardById.values()).sort((leftReward, rightReward) => {
    const milestoneDelta =
      leftReward.milestoneSolvedCount - rightReward.milestoneSolvedCount;
    if (milestoneDelta !== 0) {
      return milestoneDelta;
    }

    const earnedAtDelta =
      Date.parse(leftReward.earnedAt) - Date.parse(rightReward.earnedAt);
    if (!Number.isNaN(earnedAtDelta) && earnedAtDelta !== 0) {
      return earnedAtDelta;
    }

    return leftReward.rewardId.localeCompare(rightReward.rewardId);
  });
}

function normalizeActiveRewardRevealState(
  activeRewardReveal: unknown,
  unlockedRewardsCount: number,
): ActiveRewardRevealState {
  if (!activeRewardReveal || typeof activeRewardReveal !== "object") {
    return {
      ...resolveNextRewardTarget(unlockedRewardsCount),
      initialStatus: "missing",
      initialImagePath: null,
    };
  }

  const parsedReveal = activeRewardReveal as Partial<ActiveRewardRevealState>;
  const dinosaurName = toTrimmedValue(parsedReveal.dinosaurName);
  const milestoneSolvedCount = toNonNegativeInteger(parsedReveal.milestoneSolvedCount);
  const initialStatus =
    parsedReveal.initialStatus === "ready" ||
    parsedReveal.initialStatus === "generating" ||
    parsedReveal.initialStatus === "missing"
      ? parsedReveal.initialStatus
      : "missing";
  const initialImagePath =
    parsedReveal.initialImagePath === null
      ? null
      : toTrimmedValue(parsedReveal.initialImagePath);

  if (!dinosaurName) {
    return {
      ...resolveNextRewardTarget(unlockedRewardsCount),
      initialStatus: "missing",
      initialImagePath: null,
    };
  }

  return {
    dinosaurName,
    milestoneSolvedCount,
    initialStatus,
    initialImagePath,
  };
}

function toPersistedPlayerProfileSnapshot(
  value: unknown,
): PersistedPlayerProfileSnapshot | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const snapshot = value as Partial<PersistedPlayerProfileSnapshot>;
  if (!snapshot.gameSession || typeof snapshot.gameSession !== "object") {
    return null;
  }

  const gameSession = snapshot.gameSession as Partial<LiveGameSessionState> &
    Partial<PersistedPlayerGameSessionSnapshot>;
  const unlockedRewards = normalizeUnlockedRewardsForSession(gameSession.unlockedRewards);
  const unlockedHybrids = normalizeUnlockedHybridRewardsForSession(
    gameSession.unlockedHybrids,
  );
  const totalProblemsSolved = toNonNegativeInteger(gameSession.totalProblemsSolved);
  const totalProblemsAttempted = Math.max(
    totalProblemsSolved,
    toNonNegativeInteger(gameSession.totalProblemsAttempted),
  );
  const currentStreak = toNonNegativeInteger(gameSession.currentStreak);
  const amberBalance =
    typeof gameSession.amberBalance === "number"
      ? toNonNegativeInteger(gameSession.amberBalance)
      : totalProblemsSolved;
  const amberImagePath =
    gameSession.amberImagePath === null
      ? null
      : toTrimmedValue(gameSession.amberImagePath);

  return {
    gameSession: {
      totalProblemsSolved,
      totalProblemsAttempted,
      currentStreak,
      solvedByMode: toSolvedCountByMode(gameSession.solvedByMode, totalProblemsSolved),
      preferredGameMode: toGameModeChoice(gameSession.preferredGameMode),
      preferredDifficulty: toDifficultyChoice(gameSession.preferredDifficulty),
      amberBalance,
      amberImagePath,
      unlockedRewards,
      unlockedHybrids,
    },
    activeRewardReveal: normalizeActiveRewardRevealState(
      snapshot.activeRewardReveal,
      unlockedRewards.length,
    ),
  };
}

function toPersistedPlayerGameSessionSnapshot(
  gameSession: LiveGameSessionState,
): PersistedPlayerGameSessionSnapshot {
  const totalProblemsSolved = toNonNegativeInteger(gameSession.totalProblemsSolved);
  const totalProblemsAttempted = Math.max(
    totalProblemsSolved,
    toNonNegativeInteger(gameSession.totalProblemsAttempted),
  );
  const currentStreak = toNonNegativeInteger(gameSession.currentStreak);
  const amberBalance =
    typeof gameSession.amberBalance === "number"
      ? toNonNegativeInteger(gameSession.amberBalance)
      : totalProblemsSolved;
  const amberImagePath =
    gameSession.amberImagePath === null ? null : toTrimmedValue(gameSession.amberImagePath);

  return {
    totalProblemsSolved,
    totalProblemsAttempted,
    currentStreak,
    solvedByMode: toSolvedCountByMode(gameSession.solvedByMode, totalProblemsSolved),
    preferredGameMode: toGameModeChoice(gameSession.preferredGameMode),
    preferredDifficulty: toDifficultyChoice(gameSession.preferredDifficulty),
    amberBalance,
    amberImagePath,
    unlockedRewards: normalizeUnlockedRewardsForSession(gameSession.unlockedRewards),
    unlockedHybrids: normalizeUnlockedHybridRewardsForSession(gameSession.unlockedHybrids),
  };
}

function buildPersistedPlayerProfileSnapshot(input: {
  gameSession: LiveGameSessionState;
  activeRewardReveal: ActiveRewardRevealState;
}): PersistedPlayerProfileSnapshot {
  const persistedGameSession = toPersistedPlayerGameSessionSnapshot(input.gameSession);

  return {
    gameSession: persistedGameSession,
    activeRewardReveal: normalizeActiveRewardRevealState(
      input.activeRewardReveal,
      persistedGameSession.unlockedRewards.length,
    ),
  };
}

function resolveNextRewardTarget(unlockedRewardsCount: number): {
  rewardNumber: number;
  dinosaurName: string;
  milestoneSolvedCount: number;
} {
  const rewardNumber = Math.max(0, unlockedRewardsCount) + 1;
  const dinosaurName = getDinosaurForRewardNumber(rewardNumber);

  return {
    rewardNumber,
    dinosaurName,
    milestoneSolvedCount: getMilestoneSolvedCountForRewardNumber(
      rewardNumber,
      REWARD_UNLOCK_INTERVAL,
    ),
  };
}

function createUnlockedReward(
  rewardNumber: number,
  earnedAt: string,
): UnlockedReward {
  const dinosaurName = getDinosaurForRewardNumber(rewardNumber);

  return {
    rewardId: `reward-${rewardNumber}`,
    dinosaurName,
    imagePath: PROVISIONAL_REWARD_IMAGE_PATH,
    earnedAt,
    milestoneSolvedCount: getMilestoneSolvedCountForRewardNumber(
      rewardNumber,
      REWARD_UNLOCK_INTERVAL,
    ),
  };
}

function createUnlockedHybridReward(input: {
  firstDinosaurName: string;
  secondDinosaurName: string;
  createdAt: string;
}): UnlockedHybridReward {
  const normalizedPair = normalizeHybridPair({
    firstDinosaurName: input.firstDinosaurName,
    secondDinosaurName: input.secondDinosaurName,
  });
  const pairKey = createHybridPairKey({
    firstDinosaurName: normalizedPair.firstDinosaurName,
    secondDinosaurName: normalizedPair.secondDinosaurName,
  });
  const generationAssetName = createHybridGenerationAssetName({
    firstDinosaurName: normalizedPair.firstDinosaurName,
    secondDinosaurName: normalizedPair.secondDinosaurName,
  });

  return {
    hybridId: createHybridId(pairKey),
    hybridName: createHybridDisplayName({
      firstDinosaurName: normalizedPair.firstDinosaurName,
      secondDinosaurName: normalizedPair.secondDinosaurName,
    }),
    pairKey,
    firstDinosaurName: normalizedPair.firstDinosaurName,
    secondDinosaurName: normalizedPair.secondDinosaurName,
    generationAssetName,
    imagePath: PROVISIONAL_REWARD_IMAGE_PATH,
    createdAt: input.createdAt,
  };
}

function createFallbackConstrainedProblem(totalProblemsSolved: number): DivisionProblem {
  const divisorRange = LIVE_PROBLEM_MAX_DIVISOR - LIVE_PROBLEM_MIN_DIVISOR + 1;
  const divisor =
    LIVE_PROBLEM_MIN_DIVISOR + (Math.max(0, totalProblemsSolved) % divisorRange);
  const minimumQuotient = Math.ceil(1000 / divisor);
  const maximumQuotient = Math.floor(9999 / divisor);
  const quotientRange = Math.max(1, maximumQuotient - minimumQuotient + 1);
  const quotient =
    minimumQuotient + (Math.max(0, totalProblemsSolved * 7) % quotientRange);
  const dividend = divisor * quotient;

  return {
    id: `live-problem-fallback-${totalProblemsSolved + 1}-${divisor}-${quotient}`,
    dividend,
    divisor,
    allowRemainder: false,
    difficultyLevel: LIVE_PROBLEM_FIXED_DIFFICULTY_LEVEL,
  };
}

function resolveNextLiveProblem(totalProblemsSolved: number): {
  problem: DivisionProblem;
  steps: readonly LongDivisionStep[];
} {
  let problem: DivisionProblem | null = null;

  for (let attempt = 0; attempt < LIVE_PROBLEM_MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = generateDivisionProblem({
      difficultyLevel: LIVE_PROBLEM_FIXED_DIFFICULTY_LEVEL,
      remainderMode: "forbid",
    });
    if (
      getDigitCount(candidate.dividend) === LIVE_PROBLEM_DIVIDEND_DIGITS &&
      candidate.divisor >= LIVE_PROBLEM_MIN_DIVISOR &&
      candidate.divisor <= LIVE_PROBLEM_MAX_DIVISOR
    ) {
      problem = candidate;
      break;
    }
  }

  const resolvedProblem = problem ?? createFallbackConstrainedProblem(totalProblemsSolved);
  const normalizedProblem: DivisionProblem = {
    ...resolvedProblem,
    id: `live-problem-${totalProblemsSolved + 1}-${resolvedProblem.id}`,
  };

  const solution = solveLongDivision(normalizedProblem);

  return {
    problem: normalizedProblem,
    steps: solution.steps,
  };
}

interface NextLiveProblemResolution {
  mode: GameMode;
  problem: LiveWorkspaceProblem;
  steps: readonly WorkspaceStep[];
}

function resolveModeForNextProblem(preferredGameMode: GameModeChoice): GameMode {
  if (preferredGameMode === "mixed") {
    return Math.random() < 0.5 ? "division" : "multiplication";
  }

  return preferredGameMode;
}


function resolveNextDivisionProblemForLevel(
  totalProblemsSolved: number,
  difficultyLevel: number,
): { problem: DivisionProblem; steps: readonly LongDivisionStep[] } {
  if (difficultyLevel === LIVE_PROBLEM_FIXED_DIFFICULTY_LEVEL) {
    return resolveNextLiveProblem(totalProblemsSolved);
  }

  try {
    const problem = generateDivisionProblem({
      difficultyLevel,
      remainderMode: "forbid",
    });
    const normalizedProblem: DivisionProblem = {
      ...problem,
      id: `live-problem-${totalProblemsSolved + 1}-${problem.id}`,
    };

    return {
      problem: normalizedProblem,
      steps: solveLongDivision(normalizedProblem).steps,
    };
  } catch {
    return resolveNextLiveProblem(totalProblemsSolved);
  }
}

function resolveNextMultiplicationProblem(
  totalProblemsSolved: number,
  difficultyLevel: number,
): { problem: MultiplicationProblem; steps: readonly LongMultiplicationStep[] } {
  const problem = generateMultiplicationProblem({ difficultyLevel });
  const normalizedProblem: MultiplicationProblem = {
    ...problem,
    id: `live-problem-${totalProblemsSolved + 1}-${problem.id}`,
  };

  return {
    problem: normalizedProblem,
    steps: solveLongMultiplication(normalizedProblem).steps,
  };
}

function resolveNextProblemForPreferences(input: {
  preferredGameMode: GameModeChoice;
  preferredDifficulty: DifficultyChoice;
  totalProblemsSolved: number;
}): NextLiveProblemResolution {
  const mode = resolveModeForNextProblem(input.preferredGameMode);
  const difficultyLevel = ENGINE_LEVEL_BY_DIFFICULTY[input.preferredDifficulty];

  if (mode === "multiplication") {
    const resolution = resolveNextMultiplicationProblem(
      input.totalProblemsSolved,
      difficultyLevel,
    );
    return { mode, ...resolution };
  }

  const resolution = resolveNextDivisionProblemForLevel(
    input.totalProblemsSolved,
    difficultyLevel,
  );
  return { mode, ...resolution };
}

function incrementSolvedByMode(currentState: LiveGameSessionState): SolvedCountByMode {
  return {
    ...currentState.solvedByMode,
    [currentState.activeMode]: currentState.solvedByMode[currentState.activeMode] + 1,
  };
}

function resolveNextProblemAfterSolve(
  currentState: LiveGameSessionState,
): NextLiveProblemResolution {
  return resolveNextProblemForPreferences({
    preferredGameMode: currentState.preferredGameMode,
    preferredDifficulty: currentState.preferredDifficulty,
    totalProblemsSolved: currentState.totalProblemsSolved + 1,
  });
}

function withFreshActiveProblem(session: LiveGameSessionState): LiveGameSessionState {
  const resolution = resolveNextProblemForPreferences({
    preferredGameMode: session.preferredGameMode,
    preferredDifficulty: session.preferredDifficulty,
    totalProblemsSolved: session.totalProblemsSolved,
  });

  return {
    ...session,
    activeMode: resolution.mode,
    activeProblem: resolution.problem,
    steps: resolution.steps,
  };
}

function formatActiveInputLane(lane: ActiveInputLane | null): string {
  if (!lane) {
    return "ready";
  }

  switch (lane) {
    case "bring-down":
      return "bring down";
    case "multiply":
      return "multiply";
    case "subtract":
      return "subtract";
    default:
      return lane;
  }
}

const initialLiveGameSessionState: LiveGameSessionState = {
  activeMode: "division",
  activeProblem: workspacePreviewProblem,
  steps: workspacePreviewSolution.steps,
  sessionSolvedProblems: INITIAL_SESSION_PROBLEMS_SOLVED,
  sessionAttemptedProblems: INITIAL_SESSION_PROBLEMS_ATTEMPTED,
  currentStreak: 0,
  totalProblemsSolved: INITIAL_TOTAL_PROBLEMS_SOLVED,
  totalProblemsAttempted: INITIAL_TOTAL_PROBLEMS_ATTEMPTED,
  solvedByMode: { division: 0, multiplication: 0 },
  preferredGameMode: "division",
  preferredDifficulty: "easy",
  amberBalance: 0,
  amberImagePath: null,
  unlockedRewards: [],
  unlockedHybrids: [],
};

const initialActiveRewardRevealState: ActiveRewardRevealState = {
  ...resolveNextRewardTarget(0),
  initialStatus: "missing",
  initialImagePath: null,
};

function createFreshLiveGameSessionState(): LiveGameSessionState {
  return {
    activeMode: "division",
    activeProblem: workspacePreviewProblem,
    steps: workspacePreviewSolution.steps,
    sessionSolvedProblems: INITIAL_SESSION_PROBLEMS_SOLVED,
    sessionAttemptedProblems: INITIAL_SESSION_PROBLEMS_ATTEMPTED,
    currentStreak: 0,
    totalProblemsSolved: INITIAL_TOTAL_PROBLEMS_SOLVED,
    totalProblemsAttempted: INITIAL_TOTAL_PROBLEMS_ATTEMPTED,
    solvedByMode: { division: 0, multiplication: 0 },
    preferredGameMode: "division",
    preferredDifficulty: "easy",
    amberBalance: 0,
    amberImagePath: null,
    unlockedRewards: [],
    unlockedHybrids: [],
  };
}

function normalizeUnlockedHybridRewardsForSession(
  unlockedHybrids: unknown,
): UnlockedHybridReward[] {
  if (!Array.isArray(unlockedHybrids)) {
    return [];
  }

  const unlockedHybridByPairKey = new Map<string, UnlockedHybridReward>();
  for (const unlockedHybrid of unlockedHybrids) {
    if (!isUnlockedHybridReward(unlockedHybrid)) {
      continue;
    }

    const firstDinosaurName = toTrimmedValue(unlockedHybrid.firstDinosaurName);
    const secondDinosaurName = toTrimmedValue(unlockedHybrid.secondDinosaurName);
    const createdAt = toTrimmedValue(unlockedHybrid.createdAt);
    const imagePath = toTrimmedValue(unlockedHybrid.imagePath);
    const generationAssetName = toTrimmedValue(unlockedHybrid.generationAssetName);
    if (
      !firstDinosaurName ||
      !secondDinosaurName ||
      !createdAt ||
      !imagePath ||
      !generationAssetName
    ) {
      continue;
    }

    const pairKey = createHybridPairKey({
      firstDinosaurName,
      secondDinosaurName,
    });
    const normalizedPair = normalizeHybridPair({
      firstDinosaurName,
      secondDinosaurName,
    });

    unlockedHybridByPairKey.set(pairKey, {
      hybridId: toTrimmedValue(unlockedHybrid.hybridId) ?? createHybridId(pairKey),
      hybridName:
        toTrimmedValue(unlockedHybrid.hybridName) ??
        createHybridDisplayName({
          firstDinosaurName: normalizedPair.firstDinosaurName,
          secondDinosaurName: normalizedPair.secondDinosaurName,
        }),
      pairKey,
      firstDinosaurName: normalizedPair.firstDinosaurName,
      secondDinosaurName: normalizedPair.secondDinosaurName,
      generationAssetName,
      imagePath,
      createdAt,
    });
  }

  return Array.from(unlockedHybridByPairKey.values()).sort((leftHybrid, rightHybrid) => {
    const createdAtDelta = Date.parse(rightHybrid.createdAt) - Date.parse(leftHybrid.createdAt);
    if (!Number.isNaN(createdAtDelta) && createdAtDelta !== 0) {
      return createdAtDelta;
    }

    return leftHybrid.hybridName.localeCompare(rightHybrid.hybridName, "en", {
      sensitivity: "base",
    });
  });
}

function hydrateLiveGameSessionState(
  persistedState: PersistedPlayerGameSessionSnapshot,
): LiveGameSessionState {
  const baselineSession = createFreshLiveGameSessionState();
  const totalProblemsSolved = toNonNegativeInteger(persistedState.totalProblemsSolved);
  const totalProblemsAttempted = Math.max(
    totalProblemsSolved,
    toNonNegativeInteger(persistedState.totalProblemsAttempted),
  );

  return {
    ...baselineSession,
    totalProblemsSolved,
    totalProblemsAttempted,
    currentStreak: toNonNegativeInteger(persistedState.currentStreak),
    solvedByMode: toSolvedCountByMode(persistedState.solvedByMode, totalProblemsSolved),
    preferredGameMode: toGameModeChoice(persistedState.preferredGameMode),
    preferredDifficulty: toDifficultyChoice(persistedState.preferredDifficulty),
    amberBalance:
      typeof persistedState.amberBalance === "number"
        ? toNonNegativeInteger(persistedState.amberBalance)
        : totalProblemsSolved,
    amberImagePath:
      persistedState.amberImagePath === null
        ? null
        : toTrimmedValue(persistedState.amberImagePath),
    unlockedRewards: normalizeUnlockedRewardsForSession(persistedState.unlockedRewards),
    unlockedHybrids: normalizeUnlockedHybridRewardsForSession(
      persistedState.unlockedHybrids,
    ),
  };
}

function isStorageQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const parsedError = error as {
    name?: unknown;
    code?: unknown;
    message?: unknown;
  };
  if (parsedError.name === "QuotaExceededError") {
    return true;
  }
  if (parsedError.code === 22 || parsedError.code === 1014) {
    return true;
  }

  const message = typeof parsedError.message === "string" ? parsedError.message : "";
  return message.toLowerCase().includes("quota");
}

function isLikelyMoreAdvancedProfileSnapshot(
  candidateSnapshot: PersistedPlayerProfileSnapshot,
  baselineSnapshot: PersistedPlayerProfileSnapshot,
): boolean {
  const candidateSolved = toNonNegativeInteger(
    candidateSnapshot.gameSession.totalProblemsSolved,
  );
  const baselineSolved = toNonNegativeInteger(
    baselineSnapshot.gameSession.totalProblemsSolved,
  );
  if (candidateSolved !== baselineSolved) {
    return candidateSolved > baselineSolved;
  }

  const candidateUnlockedRewardsCount =
    candidateSnapshot.gameSession.unlockedRewards.length;
  const baselineUnlockedRewardsCount =
    baselineSnapshot.gameSession.unlockedRewards.length;
  if (candidateUnlockedRewardsCount !== baselineUnlockedRewardsCount) {
    return candidateUnlockedRewardsCount > baselineUnlockedRewardsCount;
  }

  const candidateUnlockedHybridsCount =
    candidateSnapshot.gameSession.unlockedHybrids.length;
  const baselineUnlockedHybridsCount =
    baselineSnapshot.gameSession.unlockedHybrids.length;
  if (candidateUnlockedHybridsCount !== baselineUnlockedHybridsCount) {
    return candidateUnlockedHybridsCount > baselineUnlockedHybridsCount;
  }

  const candidateAttempted = toNonNegativeInteger(
    candidateSnapshot.gameSession.totalProblemsAttempted,
  );
  const baselineAttempted = toNonNegativeInteger(
    baselineSnapshot.gameSession.totalProblemsAttempted,
  );
  if (candidateAttempted !== baselineAttempted) {
    return candidateAttempted > baselineAttempted;
  }

  const candidateAmber = toNonNegativeInteger(candidateSnapshot.gameSession.amberBalance);
  const baselineAmber = toNonNegativeInteger(baselineSnapshot.gameSession.amberBalance);
  return candidateAmber > baselineAmber;
}

export default function Home() {
  const [gameSession, setGameSession] = useState<LiveGameSessionState>(
    initialLiveGameSessionState,
  );
  const [activeRewardReveal, setActiveRewardReveal] =
    useState<ActiveRewardRevealState>(initialActiveRewardRevealState);
  const [activePlayerName, setActivePlayerName] = useState<string | null>(null);
  const [playerNameDraft, setPlayerNameDraft] = useState("");
  const [sessionStartError, setSessionStartError] = useState<string | null>(null);
  const [sessionStartStatus, setSessionStartStatus] = useState<string | null>(null);
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [isLocalProfileBackupEnabled, setIsLocalProfileBackupEnabled] = useState(true);
  const [rewardGenerationNotice, setRewardGenerationNotice] =
    useState<string | null>(null);
  const [isNextProblemReady, setIsNextProblemReady] = useState(false);
  const [isHybridLabOpen, setIsHybridLabOpen] = useState(false);
  const [hybridLabFirstDinosaurName, setHybridLabFirstDinosaurName] = useState("");
  const [hybridLabSecondDinosaurName, setHybridLabSecondDinosaurName] = useState("");
  const [hybridLabError, setHybridLabError] = useState<string | null>(null);
  const [isHybridFusionInProgress, setIsHybridFusionInProgress] = useState(false);
  const [pendingHybridFusionReward, setPendingHybridFusionReward] =
    useState<UnlockedHybridReward | null>(null);
  const [selectedHybridReward, setSelectedHybridReward] =
    useState<UnlockedHybridReward | null>(null);
  const [selectedHybridDossier, setSelectedHybridDossier] =
    useState<RewardDinosaurDossier | null>(null);
  const gameSessionRef = useRef<LiveGameSessionState>(gameSession);
  const completedProblemIdRef = useRef<string | null>(null);
  const hadErrorInCurrentProblemRef = useRef(false);
  const nextProblemButtonRef = useRef<HTMLButtonElement | null>(null);
  const hybridDetailScrollRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    gameSessionRef.current = gameSession;
  }, [gameSession]);

  useEffect(() => {
    completedProblemIdRef.current = null;
    hadErrorInCurrentProblemRef.current = false;
    setIsNextProblemReady(false);
  }, [gameSession.activeProblem.id]);

  useEffect(() => {
    if (!isSessionStarted || !isNextProblemReady) {
      return;
    }

    const focusFrameHandle = window.requestAnimationFrame(() => {
      nextProblemButtonRef.current?.focus();
    });

    return () => {
      window.cancelAnimationFrame(focusFrameHandle);
    };
  }, [isNextProblemReady, isSessionStarted]);

  const unlockedPrimaryDinosaurNames = useMemo(
    () => resolveUnlockedPrimaryDinosaurNames(gameSession.unlockedRewards),
    [gameSession.unlockedRewards],
  );
  const unlockedPrimaryDinosaurImagePathByName = useMemo(() => {
    const imagePathByName = new Map<string, string>();
    for (const unlockedReward of gameSession.unlockedRewards) {
      imagePathByName.set(unlockedReward.dinosaurName, unlockedReward.imagePath);
    }

    return imagePathByName;
  }, [gameSession.unlockedRewards]);
  const hybridLabSecondDinosaurOptions = useMemo(
    () =>
      resolveAvailableHybridSecondDinosaurNames({
        firstDinosaurName: hybridLabFirstDinosaurName,
        unlockedPrimaryDinosaurNames,
        unlockedHybrids: gameSession.unlockedHybrids,
      }),
    [
      gameSession.unlockedHybrids,
      hybridLabFirstDinosaurName,
      unlockedPrimaryDinosaurNames,
    ],
  );
  const hasAvailableHybridPairs = useMemo(
    () =>
      hasAnyAvailableHybridPairs(
        unlockedPrimaryDinosaurNames,
        gameSession.unlockedHybrids,
      ),
    [gameSession.unlockedHybrids, unlockedPrimaryDinosaurNames],
  );
  const canUnlockNextDinosaurWithAmber =
    gameSession.amberBalance >= AMBER_COST_PER_DINO_UNLOCK;
  const hasEnoughAmberForHybrid = gameSession.amberBalance >= AMBER_COST_PER_HYBRID_CREATION;
  const firstHybridPreviewImagePath =
    hybridLabFirstDinosaurName.length > 0
      ? unlockedPrimaryDinosaurImagePathByName.get(hybridLabFirstDinosaurName) ??
        PROVISIONAL_REWARD_IMAGE_PATH
      : null;
  const secondHybridPreviewImagePath =
    hybridLabSecondDinosaurName.length > 0
      ? unlockedPrimaryDinosaurImagePathByName.get(hybridLabSecondDinosaurName) ??
        PROVISIONAL_REWARD_IMAGE_PATH
      : null;
  const pendingHybridFirstPreviewImagePath = pendingHybridFusionReward
    ? unlockedPrimaryDinosaurImagePathByName.get(pendingHybridFusionReward.firstDinosaurName) ??
      PROVISIONAL_REWARD_IMAGE_PATH
    : null;
  const pendingHybridSecondPreviewImagePath = pendingHybridFusionReward
    ? unlockedPrimaryDinosaurImagePathByName.get(pendingHybridFusionReward.secondDinosaurName) ??
      PROVISIONAL_REWARD_IMAGE_PATH
    : null;
  const modalHost = typeof document !== "undefined" ? document.body : null;

  useEffect(() => {
    if (
      hybridLabSecondDinosaurName.length > 0 &&
      !hybridLabSecondDinosaurOptions.includes(hybridLabSecondDinosaurName)
    ) {
      setHybridLabSecondDinosaurName("");
    }
  }, [hybridLabSecondDinosaurName, hybridLabSecondDinosaurOptions]);

  useEffect(() => {
    if (!selectedHybridReward) {
      setSelectedHybridDossier(null);
      return;
    }

    let didCancel = false;
    const abortController = new AbortController();
    const fallbackDossier = buildHybridDinosaurDossier({
      firstDinosaurName: selectedHybridReward.firstDinosaurName,
      secondDinosaurName: selectedHybridReward.secondDinosaurName,
    });
    setSelectedHybridDossier(fallbackDossier);

    void (async () => {
      try {
        const dossierResponse = await fetch(
          toHybridRewardDossierArtifactPath(selectedHybridReward.generationAssetName),
          {
            cache: "no-store",
            signal: abortController.signal,
          },
        );

        if (!dossierResponse.ok) {
          return;
        }

        const dossierPayload = (await dossierResponse.json().catch(() => null)) as unknown;
        const parsedDossier = parseRewardDinosaurDossierArtifact(dossierPayload);
        if (!parsedDossier || didCancel) {
          return;
        }

        setSelectedHybridDossier(parsedDossier);
      } catch {
        // Keep fallback dossier when artifact loading fails.
      }
    })();

    return () => {
      didCancel = true;
      abortController.abort();
    };
  }, [selectedHybridReward]);

  useEffect(() => {
    if (!isHybridLabOpen && !selectedHybridReward) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
        return;
      }

      if (isHybridFusionInProgress) {
        return;
      }

      if (selectedHybridReward) {
        setSelectedHybridReward(null);
        return;
      }

      setIsHybridLabOpen(false);
      setHybridLabError(null);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isHybridFusionInProgress, isHybridLabOpen, selectedHybridReward]);

  const handleStartSession = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSessionStartError(null);
      setSessionStartStatus(null);
      setRewardGenerationNotice(null);

      try {
        const normalizedPlayerName = normalizePlayerProfileName(playerNameDraft);
        const localPersistedProfile =
          readPlayerProfileSnapshot<PersistedPlayerProfileSnapshot>(
            window.localStorage,
            normalizedPlayerName,
          );
        let remotePersistedProfile:
          | {
              schemaVersion: number;
              playerName: string;
              snapshot: PersistedPlayerProfileSnapshot;
              updatedAtMs: number;
            }
          | null = null;
        let remoteProfileReadError: Error | null = null;

        try {
          remotePersistedProfile =
            await fetchPlayerProfileSnapshot<PersistedPlayerProfileSnapshot>({
              playerName: normalizedPlayerName,
            });
        } catch (error) {
          remoteProfileReadError =
            error instanceof Error
              ? error
              : new Error("Unable to load shared player profile.");
        }

        const localValidSnapshot =
          localPersistedProfile
            ? toPersistedPlayerProfileSnapshot(localPersistedProfile.snapshot)
            : null;
        const remoteValidSnapshot =
          remotePersistedProfile
            ? toPersistedPlayerProfileSnapshot(remotePersistedProfile.snapshot)
            : null;
        const shouldPreferLocalOverRemote =
          !!localValidSnapshot &&
          !!remoteValidSnapshot &&
          isLikelyMoreAdvancedProfileSnapshot(localValidSnapshot, remoteValidSnapshot);

        if (remoteValidSnapshot && !shouldPreferLocalOverRemote) {
          const hydratedSession = hydrateLiveGameSessionState(
            remoteValidSnapshot.gameSession,
          );
          setGameSession(withFreshActiveProblem(hydratedSession));
          setActiveRewardReveal(remoteValidSnapshot.activeRewardReveal);

          if (isLocalProfileBackupEnabled) {
            try {
              writePlayerProfileSnapshot(
                window.localStorage,
                normalizedPlayerName,
                remoteValidSnapshot,
              );
            } catch (error) {
              if (isStorageQuotaExceededError(error)) {
                setIsLocalProfileBackupEnabled(false);
              } else {
                console.error(
                  "Failed to store local backup after loading shared profile.",
                  error,
                );
              }
            }
          }

          setSessionStartStatus(
            `Loaded ${remotePersistedProfile?.playerName ?? normalizedPlayerName}'s shared profile.`,
          );
        } else if (localValidSnapshot && localPersistedProfile) {
          const hydratedSession = hydrateLiveGameSessionState(
            localValidSnapshot.gameSession,
          );
          setGameSession(withFreshActiveProblem(hydratedSession));
          setActiveRewardReveal(localValidSnapshot.activeRewardReveal);

          if (remoteProfileReadError) {
            setSessionStartStatus(
              `Loaded ${localPersistedProfile.playerName}'s profile from this browser. Shared sync is currently unavailable.`,
            );
          } else {
            try {
              await savePlayerProfileSnapshot({
                playerName: normalizedPlayerName,
                snapshot: localValidSnapshot,
                updatedAtMs: Date.now(),
              });
              if (remoteValidSnapshot && shouldPreferLocalOverRemote) {
                setSessionStartStatus(
                  `Loaded ${localPersistedProfile.playerName}'s profile from this browser and synced newer progress to shared storage.`,
                );
              } else {
                setSessionStartStatus(
                  `Loaded ${localPersistedProfile.playerName}'s profile from this browser and synced it to shared storage.`,
                );
              }
            } catch (error) {
              console.error(
                "Failed to sync local profile snapshot to shared storage.",
                error,
              );
              setSessionStartStatus(
                `Loaded ${localPersistedProfile.playerName}'s profile from this browser. Shared sync is currently unavailable.`,
              );
            }
          }
        } else {
          const freshSession = createFreshLiveGameSessionState();
          setGameSession(withFreshActiveProblem(freshSession));
          setActiveRewardReveal({
            ...resolveNextRewardTarget(freshSession.unlockedRewards.length),
            initialStatus: "missing",
            initialImagePath: null,
          });

          if (remoteProfileReadError) {
            setSessionStartStatus(
              "Started a new profile for this player. Shared sync is currently unavailable.",
            );
          } else {
            setSessionStartStatus("Started a new profile for this player.");
          }
        }

        if (remoteProfileReadError) {
          console.error(
            "Failed to load shared player profile; used browser backup/new profile.",
            remoteProfileReadError,
          );
        }

        completedProblemIdRef.current = null;
        hadErrorInCurrentProblemRef.current = false;
        setIsNextProblemReady(false);
        setActivePlayerName(normalizedPlayerName);
        setPlayerNameDraft(normalizedPlayerName);
        setIsSessionStarted(true);
      } catch (error) {
        setSessionStartError(
          error instanceof Error ? error.message : "Unable to start this player profile.",
        );
      }
    },
    [isLocalProfileBackupEnabled, playerNameDraft],
  );

  useEffect(() => {
    if (!isSessionStarted || !activePlayerName) {
      return;
    }

    const playerProfileSnapshot = buildPersistedPlayerProfileSnapshot({
      gameSession,
      activeRewardReveal,
    });

    if (isLocalProfileBackupEnabled) {
      try {
        writePlayerProfileSnapshot(
          window.localStorage,
          activePlayerName,
          playerProfileSnapshot,
        );
      } catch (error) {
        if (isStorageQuotaExceededError(error)) {
          setIsLocalProfileBackupEnabled(false);
        } else {
          console.error("Failed to persist player profile to localStorage.", error);
        }
      }
    }

    const persistStartedAtMs = Date.now();
    const syncTimer = window.setTimeout(() => {
      void savePlayerProfileSnapshot({
        playerName: activePlayerName,
        snapshot: playerProfileSnapshot,
        updatedAtMs: persistStartedAtMs,
      }).catch((error) => {
        console.error("Failed to persist player profile to shared storage.", error);
      });
    }, 250);

    return () => {
      window.clearTimeout(syncTimer);
    };
  }, [
    activePlayerName,
    activeRewardReveal,
    gameSession,
    isLocalProfileBackupEnabled,
    isSessionStarted,
  ]);

  const syncRewardImageStatus = useCallback(async (assetName: string) => {
    const normalizedAssetName = assetName.trim();
    if (normalizedAssetName.length === 0) {
      return;
    }

    const statusSnapshot = await fetchEarnedRewardImageStatus({
      dinosaurName: normalizedAssetName,
    });
    const readyImagePath = statusSnapshot.imagePath;
    if (statusSnapshot.status !== "ready" || !readyImagePath) {
      return;
    }

    setGameSession((currentState) => {
      let didChange = false;
      const nextUnlockedRewards = currentState.unlockedRewards.map((reward) => {
        if (
          reward.dinosaurName !== normalizedAssetName ||
          reward.imagePath === readyImagePath
        ) {
          return reward;
        }

        didChange = true;
        return {
          ...reward,
          imagePath: readyImagePath,
        };
      });

      if (!didChange) {
        return currentState;
      }

      return {
        ...currentState,
        unlockedRewards: nextUnlockedRewards,
      };
    });

    setActiveRewardReveal((currentReveal) => {
      if (currentReveal.dinosaurName !== normalizedAssetName) {
        return currentReveal;
      }

      return {
        ...currentReveal,
        initialStatus: "ready",
        initialImagePath: readyImagePath,
      };
    });
  }, []);

  const syncAmberImageStatus = useCallback(async () => {
    const statusSnapshot = await fetchEarnedRewardImageStatus({
      dinosaurName: AMBER_REWARD_ASSET_NAME,
    });
    const readyImagePath = statusSnapshot.imagePath;
    if (statusSnapshot.status !== "ready" || !readyImagePath) {
      return;
    }

    setGameSession((currentState) => {
      if (currentState.amberImagePath === readyImagePath) {
        return currentState;
      }

      return {
        ...currentState,
        amberImagePath: readyImagePath,
      };
    });
  }, []);

  const syncHybridImageStatus = useCallback(
    async (hybridReward: UnlockedHybridReward) => {
      const statusSnapshot = await fetchEarnedRewardImageStatus({
        dinosaurName: hybridReward.generationAssetName,
      });
      const readyImagePath = statusSnapshot.imagePath;
      if (statusSnapshot.status !== "ready" || !readyImagePath) {
        return;
      }

      setGameSession((currentState) => {
        let didChange = false;
        const nextUnlockedHybrids = currentState.unlockedHybrids.map((entry) => {
          if (
            entry.pairKey !== hybridReward.pairKey ||
            entry.imagePath === readyImagePath
          ) {
            return entry;
          }

          didChange = true;
          return {
            ...entry,
            imagePath: readyImagePath,
          };
        });

        if (!didChange) {
          return currentState;
        }

        return {
          ...currentState,
          unlockedHybrids: nextUnlockedHybrids,
        };
      });
    },
    [],
  );

  const requestGeneratedImage = useCallback(
    async (input: {
      assetName: string;
      modelOverride?: string;
    }): Promise<{ resolvedAssetName: string; resolvedImagePath: string } | null> => {
      const normalizedAssetName = input.assetName.trim();
      if (normalizedAssetName.length === 0) {
        return null;
      }

      try {
        const response = await fetch("/api/rewards/generate-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            dinosaurName: normalizedAssetName,
            ...(input.modelOverride
              ? { modelOverride: input.modelOverride }
              : {}),
          }),
        });
        const responseBody = (await response.json().catch(() => null)) as
          | {
              data?: {
                dinosaurName?: string;
                mimeType?: string;
                imagePath?: string;
              };
              error?: {
                message?: string;
              };
            }
          | null;

        if (!response.ok) {
          const errorMessage =
            responseBody?.error?.message ??
            `Reward generation request failed with status ${response.status}.`;
          setRewardGenerationNotice(errorMessage);
          return null;
        }

        const resolvedAssetName =
          responseBody?.data?.dinosaurName?.trim() || normalizedAssetName;
        const resolvedImagePath =
          responseBody?.data?.imagePath?.trim() ??
          toRewardImagePathFromMimeType(
            resolvedAssetName,
            responseBody?.data?.mimeType?.trim() ?? null,
          );

        return {
          resolvedAssetName,
          resolvedImagePath,
        };
      } catch {
        setRewardGenerationNotice(
          "Reward generation request failed before reaching the server.",
        );
        return null;
      }
    },
    [],
  );

  const requestRewardImageGeneration = useCallback(
    async (assetName: string) => {
      const generationResult = await requestGeneratedImage({
        assetName,
      });
      if (!generationResult) {
        return;
      }

      setGameSession((currentState) => {
        let didChange = false;
        const nextUnlockedRewards = currentState.unlockedRewards.map((reward) => {
          if (
            reward.dinosaurName !== generationResult.resolvedAssetName ||
            reward.imagePath === generationResult.resolvedImagePath
          ) {
            return reward;
          }

          didChange = true;
          return {
            ...reward,
            imagePath: generationResult.resolvedImagePath,
          };
        });

        if (!didChange) {
          return currentState;
        }

        return {
          ...currentState,
          unlockedRewards: nextUnlockedRewards,
        };
      });

      setActiveRewardReveal((currentReveal) => {
        if (currentReveal.dinosaurName !== generationResult.resolvedAssetName) {
          return currentReveal;
        }

        return {
          ...currentReveal,
          initialStatus: "ready",
          initialImagePath: generationResult.resolvedImagePath,
        };
      });

      await syncRewardImageStatus(generationResult.resolvedAssetName);
      setRewardGenerationNotice(null);
    },
    [requestGeneratedImage, syncRewardImageStatus],
  );

  const requestAmberImageGeneration = useCallback(async () => {
    const generationResult = await requestGeneratedImage({
      assetName: AMBER_REWARD_ASSET_NAME,
      modelOverride: NANO_BANANA_PRO_IMAGE_MODEL,
    });
    if (!generationResult) {
      return;
    }

    setGameSession((currentState) => {
      if (currentState.amberImagePath === generationResult.resolvedImagePath) {
        return currentState;
      }

      return {
        ...currentState,
        amberImagePath: generationResult.resolvedImagePath,
      };
    });

    await syncAmberImageStatus();
    setRewardGenerationNotice(null);
  }, [requestGeneratedImage, syncAmberImageStatus]);

  const requestHybridImageGeneration = useCallback(
    async (hybridReward: UnlockedHybridReward): Promise<string | null> => {
      const generationResult = await requestGeneratedImage({
        assetName: hybridReward.generationAssetName,
      });
      if (!generationResult) {
        return null;
      }

      setGameSession((currentState) => {
        let didChange = false;
        const nextUnlockedHybrids = currentState.unlockedHybrids.map((entry) => {
          if (
            entry.pairKey !== hybridReward.pairKey ||
            entry.imagePath === generationResult.resolvedImagePath
          ) {
            return entry;
          }

          didChange = true;
          return {
            ...entry,
            imagePath: generationResult.resolvedImagePath,
          };
        });

        if (!didChange) {
          return currentState;
        }

        return {
          ...currentState,
          unlockedHybrids: nextUnlockedHybrids,
        };
      });

      try {
        await syncHybridImageStatus(hybridReward);
      } catch {
        // Keep the generated image path when status sync fails.
      }
      setRewardGenerationNotice(null);

      return generationResult.resolvedImagePath;
    },
    [requestGeneratedImage, syncHybridImageStatus],
  );

  useEffect(() => {
    if (!isSessionStarted) {
      return;
    }

    for (const unlockedReward of gameSession.unlockedRewards) {
      void requestRewardImageGeneration(unlockedReward.dinosaurName);
    }
    for (const unlockedHybrid of gameSession.unlockedHybrids) {
      void requestHybridImageGeneration(unlockedHybrid);
    }

    if (gameSession.amberBalance > 0 && !gameSession.amberImagePath) {
      void requestAmberImageGeneration();
    }
  }, [
    gameSession.amberBalance,
    gameSession.amberImagePath,
    gameSession.unlockedHybrids,
    gameSession.unlockedRewards,
    isSessionStarted,
    requestAmberImageGeneration,
    requestHybridImageGeneration,
    requestRewardImageGeneration,
  ]);

  const advanceToNextProblem = useCallback(() => {
    const currentState = gameSessionRef.current;
    const solvedWithoutErrors = !hadErrorInCurrentProblemRef.current;
    const nextSolvedByMode = incrementSolvedByMode(currentState);
    const next = resolveNextProblemAfterSolve(currentState);

    setGameSession({
      activeMode: next.mode,
      activeProblem: next.problem,
      steps: next.steps,
      sessionSolvedProblems: currentState.sessionSolvedProblems + 1,
      sessionAttemptedProblems: currentState.sessionAttemptedProblems + 1,
      currentStreak: solvedWithoutErrors
        ? currentState.currentStreak + 1
        : 0,
      totalProblemsSolved: currentState.totalProblemsSolved + 1,
      totalProblemsAttempted: currentState.totalProblemsAttempted + 1,
      solvedByMode: nextSolvedByMode,
      preferredGameMode: currentState.preferredGameMode,
      preferredDifficulty: currentState.preferredDifficulty,
      amberBalance:
        currentState.amberBalance +
        AMBER_EARNED_BY_DIFFICULTY[currentState.preferredDifficulty],
      amberImagePath: currentState.amberImagePath,
      unlockedRewards: currentState.unlockedRewards,
      unlockedHybrids: currentState.unlockedHybrids,
    });

    setIsNextProblemReady(false);
    if (!currentState.amberImagePath) {
      void requestAmberImageGeneration();
    }
  }, [requestAmberImageGeneration]);

  const handleSelectGameMode = useCallback((nextGameMode: GameModeChoice) => {
    const currentState = gameSessionRef.current;
    if (currentState.preferredGameMode === nextGameMode) {
      return;
    }

    const shouldSwapActiveProblem =
      nextGameMode === "mixed" || currentState.activeMode !== nextGameMode;
    const nextSession: LiveGameSessionState = {
      ...currentState,
      preferredGameMode: nextGameMode,
    };

    setGameSession(
      shouldSwapActiveProblem ? withFreshActiveProblem(nextSession) : nextSession,
    );
    if (shouldSwapActiveProblem) {
      setIsNextProblemReady(false);
    }
  }, []);

  const handleSelectDifficulty = useCallback((nextDifficulty: DifficultyChoice) => {
    const currentState = gameSessionRef.current;
    if (currentState.preferredDifficulty === nextDifficulty) {
      return;
    }

    setGameSession(
      withFreshActiveProblem({
        ...currentState,
        preferredDifficulty: nextDifficulty,
      }),
    );
    setIsNextProblemReady(false);
  }, []);

  const handleTradeAmberForDinosaur = useCallback(() => {
    const currentState = gameSessionRef.current;
    if (currentState.amberBalance < AMBER_COST_PER_DINO_UNLOCK) {
      setRewardGenerationNotice(
        `You need ${AMBER_COST_PER_DINO_UNLOCK} amber to unlock a dinosaur.`,
      );
      return;
    }

    const rewardNumber = currentState.unlockedRewards.length + 1;
    const unlockedReward = createUnlockedReward(rewardNumber, new Date().toISOString());

    setGameSession({
      ...currentState,
      amberBalance: currentState.amberBalance - AMBER_COST_PER_DINO_UNLOCK,
      unlockedRewards: [...currentState.unlockedRewards, unlockedReward],
    });
    setActiveRewardReveal({
      dinosaurName: unlockedReward.dinosaurName,
      milestoneSolvedCount: unlockedReward.milestoneSolvedCount,
      initialStatus: "generating",
      initialImagePath: null,
    });
    setRewardGenerationNotice(null);
    void requestRewardImageGeneration(unlockedReward.dinosaurName);
  }, [requestRewardImageGeneration]);

  const openHybridLab = useCallback(() => {
    setHybridLabError(null);
    setHybridLabFirstDinosaurName("");
    setHybridLabSecondDinosaurName("");
    setIsHybridFusionInProgress(false);
    setPendingHybridFusionReward(null);
    setSelectedHybridReward(null);
    setIsHybridLabOpen(true);
  }, []);

  const closeHybridLab = useCallback(() => {
    if (isHybridFusionInProgress) {
      return;
    }

    setHybridLabError(null);
    setHybridLabFirstDinosaurName("");
    setHybridLabSecondDinosaurName("");
    setPendingHybridFusionReward(null);
    setIsHybridLabOpen(false);
  }, [isHybridFusionInProgress]);

  const handleCreateHybrid = useCallback(async () => {
    if (isHybridFusionInProgress) {
      return;
    }

    const currentState = gameSessionRef.current;
    const firstDinosaurName = hybridLabFirstDinosaurName.trim();
    const secondDinosaurName = hybridLabSecondDinosaurName.trim();
    if (firstDinosaurName.length === 0 || secondDinosaurName.length === 0) {
      setHybridLabError("Choose two dinosaurs before running the fusion.");
      return;
    }

    if (firstDinosaurName === secondDinosaurName) {
      setHybridLabError("Choose two different dinosaurs for a hybrid.");
      return;
    }

    if (currentState.amberBalance < AMBER_COST_PER_HYBRID_CREATION) {
      setHybridLabError(
        `You need ${AMBER_COST_PER_HYBRID_CREATION} amber to create a hybrid.`,
      );
      return;
    }

    const pairKey = createHybridPairKey({
      firstDinosaurName,
      secondDinosaurName,
    });
    if (currentState.unlockedHybrids.some((entry) => entry.pairKey === pairKey)) {
      setHybridLabError("That hybrid pair is already in your gallery.");
      return;
    }

    const unlockedHybridReward = createUnlockedHybridReward({
      firstDinosaurName,
      secondDinosaurName,
      createdAt: new Date().toISOString(),
    });

    setGameSession({
      ...currentState,
      amberBalance: currentState.amberBalance - AMBER_COST_PER_HYBRID_CREATION,
      unlockedHybrids: [...currentState.unlockedHybrids, unlockedHybridReward],
    });
    setHybridLabError(null);
    setRewardGenerationNotice(null);
    setPendingHybridFusionReward(unlockedHybridReward);
    setIsHybridFusionInProgress(true);

    const generatedHybridImagePath = await requestHybridImageGeneration(
      unlockedHybridReward,
    );

    setIsHybridFusionInProgress(false);
    setPendingHybridFusionReward(null);
    setIsHybridLabOpen(false);
    setSelectedHybridReward(
      generatedHybridImagePath
        ? {
            ...unlockedHybridReward,
            imagePath: generatedHybridImagePath,
          }
        : unlockedHybridReward,
    );
  }, [
    hybridLabFirstDinosaurName,
    hybridLabSecondDinosaurName,
    isHybridFusionInProgress,
    requestHybridImageGeneration,
  ]);

  const handleWorkspaceStepValidation = useCallback(
    (validation: LongDivisionStepValidationResult) => {
      if (validation.outcome === "incorrect") {
        hadErrorInCurrentProblemRef.current = true;
      }

      if (!validation.didAdvance || validation.outcome !== "complete") {
        return;
      }

      const currentSession = gameSessionRef.current;
      const currentProblemId = currentSession.activeProblem.id;
      if (!validation.currentStepId.startsWith(`${currentProblemId}:`)) {
        return;
      }

      if (completedProblemIdRef.current === currentProblemId) {
        return;
      }

      completedProblemIdRef.current = currentProblemId;
      setIsNextProblemReady(true);
    },
    [],
  );

  const activeLaneLabel =
    gameSession.activeMode === "multiplication"
      ? gameSession.steps[0]
        ? "partial product"
        : "ready"
      : formatActiveInputLane(gameSession.steps[0] ? "quotient" : null);
  const activeModeLabel =
    gameSession.activeMode === "multiplication" ? "Multiplication" : "Division";
  if (!isSessionStarted) {
    return (
      <main className="jurassic-shell">
        <div className="jurassic-content player-start-content">
          <section
            aria-labelledby="player-start-heading"
            className="jurassic-panel player-start-panel"
            data-ui-surface="player-start"
          >
            <div className="research-center-header">
              <p className="research-center-kicker">InGen Access Node</p>
              <h1
                className="research-center-title"
                id="player-start-heading"
              >
                InGen System Login
              </h1>
              <p className="research-center-subtitle">
                Authenticate operator credentials to access the InGen math sequencers:
                long division and long multiplication.
              </p>
            </div>

            <form className="game-start-flow" onSubmit={handleStartSession}>
              <label className="game-start-label" htmlFor="game-start-player-name">
                Operator ID
              </label>
              <input
                autoComplete="username"
                className="game-start-input terminal-input"
                id="game-start-player-name"
                name="playerName"
                onChange={(event) => {
                  setPlayerNameDraft(event.target.value);
                  setSessionStartError(null);
                }}
                placeholder="Enter your InGen operator ID"
                required
                type="text"
                value={playerNameDraft}
              />

              <p className="game-start-helper">
                Use this Operator ID to log in later and resume your progress on this device.
              </p>

              {sessionStartError ? (
                <p className="game-start-error" role="alert">
                  {sessionStartError}
                </p>
              ) : null}

              {sessionStartStatus ? (
                <p className="game-start-helper" role="status">
                  {sessionStartStatus}
                </p>
              ) : null}

              <div className="save-actions">
                <button className="jp-button" data-ui-action="start-session" type="submit">
                  Authenticate Session
                </button>
              </div>
            </form>
          </section>
        </div>

        <IslaSornaToolbar />
      </main>
    );
  }

  return (
    <main className="jurassic-shell">
      <div className="jurassic-content">
        <header className="jurassic-panel jurassic-hero motif-canopy">
          <p className="eyebrow">Dinosaur Genomic Sequencing Console</p>
          <h1 className="hero-title">
            {gameSession.activeMode === "multiplication"
              ? "InGen Multiplication Dashboard"
              : "InGen Division Dashboard"}
          </h1>
        </header>

        <div className="jurassic-layout">
          <section
            aria-labelledby="game-surface-heading"
            className="jurassic-panel motif-claw"
            data-ui-surface="game"
          >
            <div className="surface-header">
              <div>
                <p className="surface-kicker">Game Workspace</p>
                <h2 className="surface-title" id="game-surface-heading">
                  {gameSession.activeMode === "multiplication"
                    ? "DNA Multiplication Sequencer"
                    : "DNA Division Sequencer"}
                </h2>
              </div>
              <p className="status-chip">
                Mode: {activeModeLabel} | Live target: {activeLaneLabel} | Player:{" "}
                {activePlayerName} | Solved: {gameSession.totalProblemsSolved} | Amber:{" "}
                {gameSession.amberBalance}
              </p>
            </div>

            <div className="mission-config" data-ui-surface="mission-config">
              <div className="mission-config-group" role="group" aria-label="Sequencer mode">
                <span className="mission-config-label">Sequencer Mode</span>
                <div className="mode-toggle">
                  {GAME_MODE_CHOICE_OPTIONS.map((option) => (
                    <button
                      className="mode-toggle-button"
                      data-selected={
                        gameSession.preferredGameMode === option.value ? "true" : "false"
                      }
                      data-ui-action={`select-mode-${option.value}`}
                      key={option.value}
                      onClick={() => handleSelectGameMode(option.value)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mission-config-group" role="group" aria-label="Difficulty">
                <span className="mission-config-label">Difficulty</span>
                <div className="mode-toggle">
                  {DIFFICULTY_CHOICE_OPTIONS.map((option) => (
                    <button
                      className="mode-toggle-button"
                      data-selected={
                        gameSession.preferredDifficulty === option.value ? "true" : "false"
                      }
                      data-ui-action={`select-difficulty-${option.value}`}
                      key={option.value}
                      onClick={() => handleSelectDifficulty(option.value)}
                      type="button"
                    >
                      {option.label}
                      <span className="mode-toggle-points">
                        +{AMBER_EARNED_BY_DIFFICULTY[option.value]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {gameSession.activeMode === "multiplication" &&
            isMultiplicationProblem(gameSession.activeProblem) ? (
              <LiveMultiplicationWorkspacePanel
                key={gameSession.activeProblem.id}
                multiplicand={gameSession.activeProblem.multiplicand}
                multiplier={gameSession.activeProblem.multiplier}
                onStepValidation={handleWorkspaceStepValidation}
                steps={gameSession.steps as readonly LongMultiplicationStep[]}
              />
            ) : (
              <LiveDivisionWorkspacePanel
                key={gameSession.activeProblem.id}
                dividend={(gameSession.activeProblem as DivisionProblem).dividend}
                divisor={(gameSession.activeProblem as DivisionProblem).divisor}
                onStepValidation={handleWorkspaceStepValidation}
                steps={gameSession.steps as readonly LongDivisionStep[]}
              />
            )}
            {isNextProblemReady ? (
              <div className="next-problem-action-row">
                <button
                  className="jp-button"
                  data-ui-action="next-problem"
                  onClick={advanceToNextProblem}
                  ref={nextProblemButtonRef}
                  type="button"
                >
                  NEXT
                </button>
              </div>
            ) : null}
          </section>

          <div className="side-stack">
            <section
              aria-labelledby="gallery-surface-heading"
              className="jurassic-panel motif-fossil"
              data-ui-surface="gallery"
            >
              <div className="surface-header">
                <div>
                  <p className="surface-kicker">Dino Gallery</p>
                  <h2 className="surface-title" id="gallery-surface-heading">
                    Unlocked Species
                  </h2>
                </div>
              </div>

              <section className="amber-bank" data-ui-surface="amber-bank">
                <div className="amber-bank-thumb">
                  <Image
                    alt="Amber currency crystal"
                    className="amber-bank-image"
                    height={120}
                    loading="lazy"
                    src={gameSession.amberImagePath ?? PROVISIONAL_REWARD_IMAGE_PATH}
                    width={120}
                  />
                </div>
                <div className="amber-bank-copy">
                  <p className="amber-bank-balance">Amber: {gameSession.amberBalance}</p>
                  <p className="amber-bank-note">
                    Amber per solve: Easy +{AMBER_EARNED_BY_DIFFICULTY.easy}, Medium +
                    {AMBER_EARNED_BY_DIFFICULTY.medium}, Hard +{AMBER_EARNED_BY_DIFFICULTY.hard}.
                  </p>
                </div>
              </section>

              <div className="amber-actions">
                <button
                  className="jp-button"
                  data-ui-action="trade-amber-for-dino"
                  disabled={!canUnlockNextDinosaurWithAmber}
                  onClick={handleTradeAmberForDinosaur}
                  type="button"
                >
                  Trade {AMBER_COST_PER_DINO_UNLOCK} Amber For Dino
                </button>
                <button
                  className="jp-button jp-button-secondary"
                  data-ui-action="open-hybrid-lab"
                  disabled={unlockedPrimaryDinosaurNames.length < 2}
                  onClick={openHybridLab}
                  type="button"
                >
                  Open Hybrid Lab ({AMBER_COST_PER_HYBRID_CREATION} Amber)
                </button>
              </div>

              <p className="amber-actions-note">
                Next unlock: {resolveNextRewardTarget(gameSession.unlockedRewards.length).dinosaurName}
              </p>

              <DinoGalleryPanel unlockedRewards={gameSession.unlockedRewards} />
            </section>

            <section
              aria-labelledby="hybrid-gallery-surface-heading"
              className="jurassic-panel motif-track"
              data-ui-surface="hybrid-gallery"
            >
              <div className="surface-header">
                <div>
                  <p className="surface-kicker">Hybrid Gallery</p>
                  <h2 className="surface-title" id="hybrid-gallery-surface-heading">
                    Fusion Species
                  </h2>
                </div>
                <p className="status-chip">
                  Unlocked pairs: {gameSession.unlockedHybrids.length}
                </p>
              </div>

              {gameSession.unlockedHybrids.length === 0 ? (
                <div className="gallery-shell" data-gallery-state="empty">
                  <p className="gallery-empty-title">No hybrids created yet.</p>
                  <p className="gallery-empty-copy">
                    Spend {AMBER_COST_PER_HYBRID_CREATION} amber in the Hybrid Lab to fuse two
                    unlocked dinosaurs.
                  </p>
                </div>
              ) : (
                <div className="gallery-grid">
                  {gameSession.unlockedHybrids.map((hybridReward) => (
                    <article className="gallery-card" key={hybridReward.hybridId}>
                      <button
                        aria-haspopup="dialog"
                        className="gallery-card-trigger"
                        onClick={() => {
                          setSelectedHybridReward(hybridReward);
                        }}
                        type="button"
                      >
                        <div className="gallery-thumb">
                          <Image
                            alt={`${hybridReward.hybridName} hybrid image`}
                            className="gallery-image"
                            height={352}
                            loading="lazy"
                            src={hybridReward.imagePath}
                            width={640}
                          />
                        </div>
                        <p className="gallery-name">{hybridReward.hybridName}</p>
                        <p className="gallery-meta">
                          Created{" "}
                          <time dateTime={hybridReward.createdAt}>
                            {new Intl.DateTimeFormat("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }).format(new Date(hybridReward.createdAt))}
                          </time>
                        </p>
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            <section
              aria-labelledby="earned-reward-surface-heading"
              className="jurassic-panel motif-canopy"
              data-ui-surface="earned-reward"
            >
              <div className="surface-header">
                <div>
                  <p className="surface-kicker">Reward Hatch</p>
                  <h2 className="surface-title" id="earned-reward-surface-heading">
                    Newly Earned Dino
                  </h2>
                </div>
              </div>

              <EarnedRewardRevealPanel
                dinosaurName={activeRewardReveal.dinosaurName}
                initialImagePath={activeRewardReveal.initialImagePath}
                initialStatus={activeRewardReveal.initialStatus}
                maxPollAttempts={20}
                milestoneSolvedCount={activeRewardReveal.milestoneSolvedCount}
                pollIntervalMs={600}
              />
              {rewardGenerationNotice ? (
                <p className="reward-loader-copy" role="status">
                  {rewardGenerationNotice}
                </p>
              ) : null}
            </section>
          </div>
        </div>
      </div>

      {isHybridLabOpen && modalHost
        ? createPortal(
            <div
              className="jp-modal-backdrop"
              data-ui-surface="hybrid-lab-modal"
              onClick={closeHybridLab}
              role="presentation"
            >
              <div className="jp-modal-aura">
                <section
                  aria-label="Hybrid Lab"
                  aria-modal="true"
                  className="jp-modal hybrid-lab-modal"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  role="dialog"
                >
                  <p className="surface-kicker">Hybrid Lab</p>
                  <h3 className="surface-title">DNA Fusion</h3>
                  {isHybridFusionInProgress && pendingHybridFusionReward ? (
                    <>
                      <p className="hybrid-lab-copy">
                        Fusion sequence engaged. Hold while the lab compiles your hybrid genome.
                      </p>
                      <div className="hybrid-preview-row" data-hybrid-preview-state="generating">
                        <article className="hybrid-preview-card" data-hybrid-preview-slot="first">
                          <div className="hybrid-preview-thumb">
                            <Image
                              alt={`${pendingHybridFusionReward.firstDinosaurName} preview`}
                              className="hybrid-preview-image"
                              height={180}
                              loading="lazy"
                              src={pendingHybridFirstPreviewImagePath ?? PROVISIONAL_REWARD_IMAGE_PATH}
                              width={180}
                            />
                          </div>
                          <p className="hybrid-preview-name">
                            {pendingHybridFusionReward.firstDinosaurName}
                          </p>
                        </article>
                        <p className="hybrid-preview-operator" aria-hidden="true">
                          ×
                        </p>
                        <article className="hybrid-preview-card" data-hybrid-preview-slot="second">
                          <div className="hybrid-preview-thumb">
                            <Image
                              alt={`${pendingHybridFusionReward.secondDinosaurName} preview`}
                              className="hybrid-preview-image"
                              height={180}
                              loading="lazy"
                              src={pendingHybridSecondPreviewImagePath ?? PROVISIONAL_REWARD_IMAGE_PATH}
                              width={180}
                            />
                          </div>
                          <p className="hybrid-preview-name">
                            {pendingHybridFusionReward.secondDinosaurName}
                          </p>
                        </article>
                      </div>
                      <section className="hybrid-fusion-loader" role="status" aria-live="polite">
                        <p className="reward-loader-title">Executing DNA splice...</p>
                        <p className="hybrid-lab-copy">
                          Synthesizing {pendingHybridFusionReward.hybridName}. Opening the hybrid dossier when
                          sequencing completes.
                        </p>
                        <div className="hybrid-fusion-bars" aria-hidden="true">
                          <span className="hybrid-fusion-bar" />
                          <span className="hybrid-fusion-bar" />
                          <span className="hybrid-fusion-bar" />
                          <span className="hybrid-fusion-bar" />
                        </div>
                      </section>
                      <div className="hybrid-lab-actions">
                        <button className="jp-button jp-button-secondary" disabled type="button">
                          Fusion In Progress
                        </button>
                        <button className="jp-button" disabled type="button">
                          Generating Hybrid...
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="hybrid-lab-copy">
                        Spend {AMBER_COST_PER_HYBRID_CREATION} amber to generate one hybrid per dinosaur pair.
                      </p>
                      <p className="hybrid-lab-copy">
                        Amber available: <strong>{gameSession.amberBalance}</strong>
                      </p>
                      {!hasAvailableHybridPairs ? (
                        <p className="hybrid-lab-copy">
                          None available. You&apos;ve already created all hybrids from unlocked dinosaurs.
                        </p>
                      ) : null}

                      <label className="hybrid-lab-label" htmlFor="hybrid-lab-first-dino">
                        First dinosaur
                      </label>
                      <select
                        className="hybrid-lab-select"
                        id="hybrid-lab-first-dino"
                        onChange={(event) => {
                          setHybridLabFirstDinosaurName(event.target.value);
                          setHybridLabSecondDinosaurName("");
                          setHybridLabError(null);
                        }}
                        value={hybridLabFirstDinosaurName}
                      >
                        <option value="">Choose a dinosaur</option>
                        {unlockedPrimaryDinosaurNames.map((dinosaurName) => (
                          <option key={dinosaurName} value={dinosaurName}>
                            {dinosaurName}
                          </option>
                        ))}
                      </select>

                      <label className="hybrid-lab-label" htmlFor="hybrid-lab-second-dino">
                        Second dinosaur
                      </label>
                      {hybridLabFirstDinosaurName.length === 0 ? (
                        <p className="hybrid-lab-copy">Choose the first dinosaur to continue.</p>
                      ) : hybridLabSecondDinosaurOptions.length === 0 ? (
                        <p className="hybrid-lab-copy">
                          None available. You&apos;ve already created all hybrids for {hybridLabFirstDinosaurName}.
                        </p>
                      ) : (
                        <select
                          className="hybrid-lab-select"
                          id="hybrid-lab-second-dino"
                          onChange={(event) => {
                            setHybridLabSecondDinosaurName(event.target.value);
                            setHybridLabError(null);
                          }}
                          value={hybridLabSecondDinosaurName}
                        >
                          <option value="">Choose a dinosaur</option>
                          {hybridLabSecondDinosaurOptions.map((dinosaurName) => (
                            <option key={dinosaurName} value={dinosaurName}>
                              {dinosaurName}
                            </option>
                          ))}
                        </select>
                      )}

                      <p className="hybrid-lab-preview-title">Fusion Preview</p>
                      <div
                        className="hybrid-preview-row"
                        data-hybrid-preview-state={
                          hybridLabFirstDinosaurName.length > 0 && hybridLabSecondDinosaurName.length > 0
                            ? "ready"
                            : "partial"
                        }
                      >
                        <article className="hybrid-preview-card" data-hybrid-preview-slot="first">
                          <div className="hybrid-preview-thumb">
                            {firstHybridPreviewImagePath ? (
                              <Image
                                alt={
                                  hybridLabFirstDinosaurName.length > 0
                                    ? `${hybridLabFirstDinosaurName} preview`
                                    : "First dinosaur preview placeholder"
                                }
                                className="hybrid-preview-image"
                                height={180}
                                loading="lazy"
                                src={firstHybridPreviewImagePath}
                                width={180}
                              />
                            ) : (
                              <span className="hybrid-preview-placeholder">Awaiting selection</span>
                            )}
                          </div>
                          <p className="hybrid-preview-name">
                            {hybridLabFirstDinosaurName || "First profile"}
                          </p>
                        </article>
                        <p className="hybrid-preview-operator" aria-hidden="true">
                          ×
                        </p>
                        <article className="hybrid-preview-card" data-hybrid-preview-slot="second">
                          <div className="hybrid-preview-thumb">
                            {secondHybridPreviewImagePath ? (
                              <Image
                                alt={
                                  hybridLabSecondDinosaurName.length > 0
                                    ? `${hybridLabSecondDinosaurName} preview`
                                    : "Second dinosaur preview placeholder"
                                }
                                className="hybrid-preview-image"
                                height={180}
                                loading="lazy"
                                src={secondHybridPreviewImagePath}
                                width={180}
                              />
                            ) : (
                              <span className="hybrid-preview-placeholder">Awaiting selection</span>
                            )}
                          </div>
                          <p className="hybrid-preview-name">
                            {hybridLabSecondDinosaurName || "Second profile"}
                          </p>
                        </article>
                      </div>

                      {hybridLabError ? (
                        <p className="game-start-error" role="alert">
                          {hybridLabError}
                        </p>
                      ) : null}

                      <div className="hybrid-lab-actions">
                        <button
                          className="jp-button jp-button-secondary"
                          disabled={isHybridFusionInProgress}
                          onClick={closeHybridLab}
                          type="button"
                        >
                          Close
                        </button>
                        <button
                          className="jp-button"
                          data-ui-action="create-hybrid"
                          disabled={
                            isHybridFusionInProgress ||
                            !hasAvailableHybridPairs ||
                            hybridLabFirstDinosaurName.length === 0 ||
                            hybridLabSecondDinosaurName.length === 0 ||
                            !hasEnoughAmberForHybrid
                          }
                          onClick={() => {
                            void handleCreateHybrid();
                          }}
                          type="button"
                        >
                          Create Hybrid
                        </button>
                      </div>
                    </>
                  )}
                </section>
              </div>
            </div>,
            modalHost,
          )
        : null}

      {selectedHybridReward && modalHost
        ? createPortal(
            <div
              className="jp-modal-backdrop"
              data-ui-surface="hybrid-detail-modal"
              onClick={() => {
                setSelectedHybridReward(null);
              }}
              role="presentation"
            >
              <div className="jp-modal-aura">
                <section
                  aria-label={`${selectedHybridReward.hybridName} details`}
                  aria-modal="true"
                  className="jp-modal gallery-detail-modal scroll-indicator-container"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  ref={hybridDetailScrollRef}
                  role="dialog"
                >
                  <ScrollIndicators scrollRef={hybridDetailScrollRef} />
                  <p className="surface-kicker">Hybrid Detail</p>
                  <h3 className="surface-title gallery-detail-title">{selectedHybridReward.hybridName}</h3>
                  <p className="gallery-detail-meta">
                    Built from {selectedHybridReward.firstDinosaurName} +{" "}
                    {selectedHybridReward.secondDinosaurName}
                  </p>
                  {selectedHybridDossier ? (
                    <section className="dino-dossier" data-ui-surface="hybrid-dossier">
                      <p className="dino-dossier-dimensions">
                        Height: {formatMetersAsMetersAndFeet(selectedHybridDossier.heightMeters)} •
                        Length: {formatMetersAsMetersAndFeet(selectedHybridDossier.lengthMeters)}
                      </p>
                      <p className="dino-dossier-description">
                        {selectedHybridDossier.description}
                      </p>
                      <ul className="dino-dossier-attributes" aria-label="Hybrid attributes">
                        {selectedHybridDossier.attributes.map((attribute) => (
                          <li className="dino-dossier-attribute" key={attribute}>
                            {attribute}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ) : null}
                  <Image
                    alt={`${selectedHybridReward.hybridName} hybrid image`}
                    className="gallery-detail-image"
                    height={540}
                    loading="lazy"
                    src={selectedHybridReward.imagePath}
                    width={960}
                  />
                  <button
                    className="jp-button"
                    onClick={() => {
                      setSelectedHybridReward(null);
                    }}
                    type="button"
                  >
                    Close
                  </button>
                </section>
              </div>
            </div>,
            modalHost,
          )
        : null}

      <IslaSornaToolbar
        stats={{
          problemsSolved: gameSession.sessionSolvedProblems,
          currentStreak: gameSession.currentStreak,
          difficultyLevel: gameSession.activeProblem.difficultyLevel,
        }}
      />
    </main>
  );
}
