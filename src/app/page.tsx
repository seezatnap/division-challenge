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
import {
  generateFractionReductionProblem,
  type FractionReductionProblem,
} from "@/features/fraction-engine";
import { EarnedRewardRevealPanel } from "@/features/rewards/components/earned-reward-reveal-panel";
import {
  fetchEarnedRewardImageStatus,
  fetchRewardImageStatuses,
  type EarnedRewardImageStatusSnapshot,
  type EarnedRewardImageStatus,
} from "@/features/rewards/lib/earned-reward-reveal";
import {
  REWARD_UNLOCK_INTERVAL,
  getDinosaurForRewardNumber,
  getMilestoneSolvedCountForRewardNumber,
} from "@/features/rewards/lib/dinosaurs";
import {
  PROVISIONAL_REWARD_IMAGE_PATH,
  isProvisionalRewardImagePath,
} from "@/features/rewards/lib/provisional-reward-image";
import {
  buildHybridDinosaurDossier,
  formatMetersAsMetersAndFeet,
  parseRewardDinosaurDossierArtifact,
  toRewardDossierApiPath,
  type RewardDinosaurDossier,
} from "@/features/rewards/lib/dino-dossiers";
import { BarbasolSpinner } from "@/features/workspace-ui/components/barbasol-spinner";
import { FractionReductionPanel } from "@/features/workspace-ui/components/fraction-reduction-panel";
import { LiveDivisionWorkspacePanel } from "@/features/workspace-ui/components/live-division-workspace-panel";
import { LiveMultiplicationWorkspacePanel } from "@/features/workspace-ui/components/live-multiplication-workspace-panel";
import {
  MIN_PLAYER_PASSWORD_LENGTH,
  changePlayerPassword,
  fetchCurrentPlayerSession,
  fetchPlayerProfileSnapshot,
  isPlayerAuthApiError,
  loginPlayer,
  logoutPlayer,
  normalizePlayerProfileName,
  readPlayerProfileSnapshot,
  registerPlayer,
  savePlayerProfileSnapshot,
  writePlayerProfileSnapshot,
} from "@/features/persistence/lib";

type OperatorAuthMode = "login" | "register";

const ACCOUNT_NOTICE_DURATION_MS = 4000;
const AUTH_SERVICE_UNREACHABLE_MESSAGE =
  "Unable to reach the InGen authentication service. Check your connection and try again.";

const APP_BOOT_SPLASH_MINIMUM_DURATION_MS = 480;

const workspacePreviewProblem: DivisionProblem = {
  id: "workspace-preview-problem",
  dividend: 4320,
  divisor: 12,
  allowRemainder: false,
  difficultyLevel: 1,
};

const workspacePreviewSolution = solveLongDivision(workspacePreviewProblem);

export type GameModeChoice = GameMode;
export type DifficultyChoice = "easy" | "medium" | "hard";

type LiveWorkspaceProblem =
  | DivisionProblem
  | MultiplicationProblem
  | FractionReductionProblem;

function isMultiplicationProblem(
  problem: LiveWorkspaceProblem,
): problem is MultiplicationProblem {
  return "multiplicand" in problem;
}

function isFractionProblem(
  problem: LiveWorkspaceProblem,
): problem is FractionReductionProblem {
  return "fraction" in problem;
}

interface SolvedCountByMode {
  division: number;
  multiplication: number;
  fractions: number;
}

interface LiveGameSessionState {
  activeMode: GameMode;
  activeProblem: LiveWorkspaceProblem;
  steps: readonly WorkspaceStep[];
  sessionSolvedProblems: number;
  sessionAttemptedProblems: number;
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

function toRewardRevealIdentityKey(reveal: ActiveRewardRevealState): string {
  return `${reveal.dinosaurName}|${reveal.milestoneSolvedCount}`;
}

interface PersistedPlayerGameSessionSnapshot {
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

interface PersistedPlayerProfileSnapshot {
  gameSession: PersistedPlayerGameSessionSnapshot;
  activeRewardReveal: ActiveRewardRevealState;
}

const INITIAL_TOTAL_PROBLEMS_SOLVED = 0;
const INITIAL_TOTAL_PROBLEMS_ATTEMPTED = 0;
const INITIAL_SESSION_PROBLEMS_SOLVED = 0;
const INITIAL_SESSION_PROBLEMS_ATTEMPTED = 0;
const AMBER_COST_PER_DINO_UNLOCK = 20;
const AMBER_COST_PER_HYBRID_CREATION = 16;
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
  { value: "fractions", label: "Fractions" },
];

const ENGINE_LEVEL_BY_DIFFICULTY: Record<DifficultyChoice, number> = {
  easy: 1,
  medium: 3,
  hard: 5,
};

const AMBER_EARNED_BY_DIFFICULTY: Record<DifficultyChoice, number> = {
  easy: 2,
  medium: 4,
  hard: 8,
};

// Easy division and multiplication are quick wins, so they pay half the
// easy rate; easy fractions still take real work and keep the full amount.
const AMBER_EARNED_EASY_ARITHMETIC = 1;

function resolveAmberEarned(mode: GameMode, difficulty: DifficultyChoice): number {
  if (difficulty === "easy" && (mode === "division" || mode === "multiplication")) {
    return AMBER_EARNED_EASY_ARITHMETIC;
  }

  return AMBER_EARNED_BY_DIFFICULTY[difficulty];
}

const DIFFICULTY_CHOICE_OPTIONS: readonly {
  value: DifficultyChoice;
  label: string;
}[] = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

function toGameModeChoice(value: unknown): GameModeChoice {
  // Profiles saved before fraction mode may carry the retired "mixed" choice;
  // those fall back to division.
  return value === "multiplication" || value === "fractions" ? value : "division";
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
    fractions: toNonNegativeInteger(record.fractions),
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
  const amberBalance =
    typeof gameSession.amberBalance === "number"
      ? toNonNegativeInteger(gameSession.amberBalance)
      : totalProblemsSolved;
  const amberImagePath =
    gameSession.amberImagePath === null ? null : toTrimmedValue(gameSession.amberImagePath);

  return {
    totalProblemsSolved,
    totalProblemsAttempted,
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
  return preferredGameMode;
}

function resolveNextFractionProblem(
  totalProblemsSolved: number,
  difficultyLevel: number,
): { problem: FractionReductionProblem; steps: readonly WorkspaceStep[] } {
  const problem = generateFractionReductionProblem({ difficultyLevel });

  return {
    // Fraction problems are not step-driven, but the id keeps the same shape as
    // the other modes so problem-scoped effects and dedupes behave identically.
    problem: { ...problem, id: `live-problem-${totalProblemsSolved + 1}-${problem.id}` },
    steps: [],
  };
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

  if (mode === "fractions") {
    const resolution = resolveNextFractionProblem(input.totalProblemsSolved, difficultyLevel);
    return { mode, ...resolution };
  }

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
  totalProblemsSolved: INITIAL_TOTAL_PROBLEMS_SOLVED,
  totalProblemsAttempted: INITIAL_TOTAL_PROBLEMS_ATTEMPTED,
  solvedByMode: { division: 0, multiplication: 0, fractions: 0 },
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
      totalProblemsSolved: INITIAL_TOTAL_PROBLEMS_SOLVED,
    totalProblemsAttempted: INITIAL_TOTAL_PROBLEMS_ATTEMPTED,
    solvedByMode: { division: 0, multiplication: 0, fractions: 0 },
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
  // Identity of the reveal that came out of a saved profile (if any). Only a
  // reward unlocked during this session should auto-pop the reveal modal.
  const [restoredRewardRevealKey, setRestoredRewardRevealKey] = useState<
    string | null
  >(null);
  const [activeRewardReveal, setActiveRewardReveal] =
    useState<ActiveRewardRevealState>(initialActiveRewardRevealState);
  const [activePlayerName, setActivePlayerName] = useState<string | null>(null);
  const [playerNameDraft, setPlayerNameDraft] = useState("");
  const [passwordDraft, setPasswordDraft] = useState("");
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState("");
  const [authMode, setAuthMode] = useState<OperatorAuthMode>("login");
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState("");
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [confirmNewPasswordDraft, setConfirmNewPasswordDraft] = useState("");
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  // Operator dropdown: click-away and Escape close it.
  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsAccountMenuOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);
  const [sessionStartError, setSessionStartError] = useState<string | null>(null);
  const [sessionStartStatus, setSessionStartStatus] = useState<string | null>(null);
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [isLocalProfileBackupEnabled, setIsLocalProfileBackupEnabled] = useState(true);
  const [isBootSplashActive, setIsBootSplashActive] = useState(true);
  const [rewardGenerationNotice, setRewardGenerationNotice] =
    useState<string | null>(null);
  const [isNextProblemReady, setIsNextProblemReady] = useState(false);
  const [amberGain, setAmberGain] = useState<{
    amount: number;
    displayKey: number;
  } | null>(null);
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
  const nextProblemButtonRef = useRef<HTMLButtonElement | null>(null);
  const hybridDetailScrollRef = useRef<HTMLElement | null>(null);
  const hasAttemptedSessionRestoreRef = useRef(false);
  const amberBalanceRef = useRef(initialLiveGameSessionState.amberBalance);

  useEffect(() => {
    gameSessionRef.current = gameSession;
  }, [gameSession]);

  // Celebrate amber earnings at the moment they land instead of silently
  // bumping a number in the side panel.
  useEffect(() => {
    const previousBalance = amberBalanceRef.current;
    amberBalanceRef.current = gameSession.amberBalance;

    const delta = gameSession.amberBalance - previousBalance;
    if (delta > 0) {
      setAmberGain({ amount: delta, displayKey: Date.now() });
    }
  }, [gameSession.amberBalance]);

  useEffect(() => {
    if (!amberGain) {
      return;
    }

    const clearGainTimeout = setTimeout(() => {
      setAmberGain(null);
    }, 1900);

    return () => {
      clearTimeout(clearGainTimeout);
    };
  }, [amberGain]);

  useEffect(() => {
    completedProblemIdRef.current = null;
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

  // Shared by password login and silent session restore: merges the browser
  // backup and the shared profile, prefers whichever is further along, then
  // opens the dashboard.
  const hydrateProfileForPlayer = useCallback(
    async (authenticatedPlayerName: string): Promise<void> => {
      const normalizedPlayerName = normalizePlayerProfileName(authenticatedPlayerName);
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
        setRestoredRewardRevealKey(
          toRewardRevealIdentityKey(remoteValidSnapshot.activeRewardReveal),
        );

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
        setRestoredRewardRevealKey(
          toRewardRevealIdentityKey(localValidSnapshot.activeRewardReveal),
        );

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
        setRestoredRewardRevealKey(null);

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
      setIsNextProblemReady(false);
      setActivePlayerName(normalizedPlayerName);
      setPlayerNameDraft(normalizedPlayerName);
      setPasswordDraft("");
      setConfirmPasswordDraft("");
      setAuthMode("login");
      setIsSessionStarted(true);
    },
    [isLocalProfileBackupEnabled],
  );

  const handleLogout = useCallback(async () => {
    try {
      await logoutPlayer();
    } catch (error) {
      console.error("Failed to end the operator session.", error);
    }

    completedProblemIdRef.current = null;
    setActivePlayerName(null);
    setGameSession(initialLiveGameSessionState);
    setActiveRewardReveal(initialActiveRewardRevealState);
    setRestoredRewardRevealKey(null);
    setPasswordDraft("");
    setConfirmPasswordDraft("");
    setCurrentPasswordDraft("");
    setNewPasswordDraft("");
    setConfirmNewPasswordDraft("");
    setIsChangePasswordOpen(false);
    setIsHybridLabOpen(false);
    setSelectedHybridReward(null);
    setSelectedHybridDossier(null);
    setIsHybridFusionInProgress(false);
    setPendingHybridFusionReward(null);
    setAccountNotice(null);
    setSessionStartError(null);
    setSessionStartStatus(null);
    setRewardGenerationNotice(null);
    setIsNextProblemReady(false);
    setIsSessionStarted(false);
  }, []);

  useEffect(() => {
    if (hasAttemptedSessionRestoreRef.current) {
      return;
    }
    hasAttemptedSessionRestoreRef.current = true;

    let didCancel = false;
    const minimumSplashDelay = new Promise((resolve) => {
      setTimeout(resolve, APP_BOOT_SPLASH_MINIMUM_DURATION_MS);
    });

    // The httpOnly operator cookie is still valid for up to 30 days, so a
    // returning player should land straight on their dashboard instead of
    // re-typing credentials on every visit.
    void (async () => {
      try {
        const sessionPlayer = await fetchCurrentPlayerSession();
        if (didCancel) {
          return;
        }

        if (sessionPlayer) {
          await hydrateProfileForPlayer(sessionPlayer.playerName);
          await minimumSplashDelay;
          if (!didCancel) {
            setIsBootSplashActive(false);
          }
          return;
        }
      } catch (error) {
        console.error(
          "Session restore failed; falling back to the login panel.",
          error,
        );
      }

      await minimumSplashDelay;
      if (!didCancel) {
        setIsBootSplashActive(false);
      }
    })();

    return () => {
      didCancel = true;
    };
  }, [hydrateProfileForPlayer]);

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
          toRewardDossierApiPath(selectedHybridReward.generationAssetName),
          {
            cache: "no-store",
            signal: abortController.signal,
          },
        );

        if (!dossierResponse.ok) {
          return;
        }

        const dossierResponseBody = (await dossierResponse.json().catch(() => null)) as {
          data?: { dossier?: unknown };
        } | null;
        const parsedDossier = parseRewardDinosaurDossierArtifact(
          dossierResponseBody?.data?.dossier,
        );
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

  const openChangePasswordModal = useCallback(() => {
    setCurrentPasswordDraft("");
    setNewPasswordDraft("");
    setConfirmNewPasswordDraft("");
    setChangePasswordError(null);
    setAccountNotice(null);
    setIsChangePasswordOpen(true);
  }, []);

  const closeChangePasswordModal = useCallback(() => {
    if (isChangingPassword) {
      return;
    }

    setIsChangePasswordOpen(false);
    setChangePasswordError(null);
  }, [isChangingPassword]);

  const handleChangePassword = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setChangePasswordError(null);

      if (newPasswordDraft.length < MIN_PLAYER_PASSWORD_LENGTH) {
        setChangePasswordError(
          `New password must be at least ${MIN_PLAYER_PASSWORD_LENGTH} characters.`,
        );
        return;
      }

      if (newPasswordDraft !== confirmNewPasswordDraft) {
        setChangePasswordError("New passwords do not match.");
        return;
      }

      if (newPasswordDraft === currentPasswordDraft) {
        setChangePasswordError("New password must be different from the current password.");
        return;
      }

      setIsChangingPassword(true);
      try {
        await changePlayerPassword({
          currentPassword: currentPasswordDraft,
          newPassword: newPasswordDraft,
        });
        setIsChangePasswordOpen(false);
        setCurrentPasswordDraft("");
        setNewPasswordDraft("");
        setConfirmNewPasswordDraft("");
        setAccountNotice("Password updated.");
      } catch (error) {
        setChangePasswordError(
          isPlayerAuthApiError(error) ? error.message : AUTH_SERVICE_UNREACHABLE_MESSAGE,
        );
      } finally {
        setIsChangingPassword(false);
      }
    },
    [confirmNewPasswordDraft, currentPasswordDraft, newPasswordDraft],
  );

  useEffect(() => {
    if (!accountNotice) {
      return;
    }

    const noticeTimer = window.setTimeout(() => {
      setAccountNotice(null);
    }, ACCOUNT_NOTICE_DURATION_MS);

    return () => {
      window.clearTimeout(noticeTimer);
    };
  }, [accountNotice]);

  useEffect(() => {
    if (!isChangePasswordOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        closeChangePasswordModal();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeChangePasswordModal, isChangePasswordOpen]);

  const handleStartSession = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSessionStartError(null);
      setSessionStartStatus(null);
      setRewardGenerationNotice(null);

      try {
        const requestedPlayerName = normalizePlayerProfileName(playerNameDraft);
        if (passwordDraft.length === 0) {
          setSessionStartError("Password is required.");
          return;
        }

        if (authMode === "register") {
          if (passwordDraft.length < MIN_PLAYER_PASSWORD_LENGTH) {
            setSessionStartError(
              `Password must be at least ${MIN_PLAYER_PASSWORD_LENGTH} characters.`,
            );
            return;
          }

          if (passwordDraft !== confirmPasswordDraft) {
            setSessionStartError("Passwords do not match.");
            return;
          }
        }

        setIsAuthenticating(true);
        let authenticatedPlayer: { playerName: string };
        try {
          authenticatedPlayer =
            authMode === "register"
              ? await registerPlayer({
                  playerName: requestedPlayerName,
                  password: passwordDraft,
                })
              : await loginPlayer({
                  playerName: requestedPlayerName,
                  password: passwordDraft,
                });
        } catch (error) {
          if (!isPlayerAuthApiError(error)) {
            throw new Error(AUTH_SERVICE_UNREACHABLE_MESSAGE);
          }

          if (error.code === "unknown-operator" && authMode === "login") {
            setAuthMode("register");
            setConfirmPasswordDraft("");
            setSessionStartStatus(
              "No operator found with that ID. Confirm your password below to register it as a new operator.",
            );
            return;
          }

          if (error.code === "operator-exists") {
            setAuthMode("login");
            setConfirmPasswordDraft("");
          }

          throw error;
        }

        await hydrateProfileForPlayer(authenticatedPlayer.playerName);
      } catch (error) {
        setSessionStartError(
          error instanceof Error ? error.message : "Unable to start this player profile.",
        );
      } finally {
        setIsAuthenticating(false);
      }
    },
    [
      authMode,
      confirmPasswordDraft,
      hydrateProfileForPlayer,
      passwordDraft,
      playerNameDraft,
    ],
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

  const syncRewardImageStatus = useCallback(async (
    assetName: string,
    prefetchedSnapshot?: EarnedRewardImageStatusSnapshot,
  ) => {
    const normalizedAssetName = assetName.trim();
    if (normalizedAssetName.length === 0) {
      return;
    }

    const statusSnapshot =
      prefetchedSnapshot ??
      (await fetchEarnedRewardImageStatus({
        dinosaurName: normalizedAssetName,
      }));
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

  const syncAmberImageStatus = useCallback(async (
    prefetchedSnapshot?: EarnedRewardImageStatusSnapshot,
  ) => {
    const statusSnapshot =
      prefetchedSnapshot ??
      (await fetchEarnedRewardImageStatus({
        dinosaurName: AMBER_REWARD_ASSET_NAME,
      }));
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
    async (
      hybridReward: UnlockedHybridReward,
      prefetchedSnapshot?: EarnedRewardImageStatusSnapshot,
    ) => {
      const statusSnapshot =
        prefetchedSnapshot ??
        (await fetchEarnedRewardImageStatus({
          dinosaurName: hybridReward.generationAssetName,
        }));
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

  // One bulk status request covers every unlocked reward. Anything already
  // rendered just has its path refreshed; only genuinely missing assets are
  // sent for generation. Requesting generation for all of them (the previous
  // behaviour) re-downloaded every image on the server and shipped megabytes of
  // unused JSON back on each load.
  useEffect(() => {
    if (!isSessionStarted) {
      return;
    }

    const needsAmberImage = gameSession.amberBalance > 0 && !gameSession.amberImagePath;
    const assetNames = [
      ...gameSession.unlockedRewards.map((unlockedReward) => unlockedReward.dinosaurName),
      ...gameSession.unlockedHybrids.map((unlockedHybrid) => unlockedHybrid.generationAssetName),
      ...(needsAmberImage ? [AMBER_REWARD_ASSET_NAME] : []),
    ];

    if (assetNames.length === 0) {
      return;
    }

    let didCancel = false;

    void (async () => {
      let statusByAssetName = new Map<string, EarnedRewardImageStatusSnapshot>();
      try {
        statusByAssetName = await fetchRewardImageStatuses({ dinosaurNames: assetNames });
      } catch {
        // Fall through with an empty map: missing statuses are treated as
        // "needs generating", which is the previous behaviour.
      }

      if (didCancel) {
        return;
      }

      const isMissing = (assetName: string): boolean =>
        (statusByAssetName.get(assetName)?.status ?? "missing") === "missing";

      for (const unlockedReward of gameSession.unlockedRewards) {
        const snapshot = statusByAssetName.get(unlockedReward.dinosaurName);
        if (snapshot?.status === "ready") {
          void syncRewardImageStatus(unlockedReward.dinosaurName, snapshot);
        } else if (isMissing(unlockedReward.dinosaurName)) {
          void requestRewardImageGeneration(unlockedReward.dinosaurName);
        }
      }

      for (const unlockedHybrid of gameSession.unlockedHybrids) {
        const snapshot = statusByAssetName.get(unlockedHybrid.generationAssetName);
        if (snapshot?.status === "ready") {
          void syncHybridImageStatus(unlockedHybrid, snapshot);
        } else if (isMissing(unlockedHybrid.generationAssetName)) {
          void requestHybridImageGeneration(unlockedHybrid);
        }
      }

      if (needsAmberImage) {
        const snapshot = statusByAssetName.get(AMBER_REWARD_ASSET_NAME);
        if (snapshot?.status === "ready") {
          void syncAmberImageStatus(snapshot);
        } else if (isMissing(AMBER_REWARD_ASSET_NAME)) {
          void requestAmberImageGeneration();
        }
      }
    })();

    return () => {
      didCancel = true;
    };
  }, [
    gameSession.amberBalance,
    gameSession.amberImagePath,
    gameSession.unlockedHybrids,
    gameSession.unlockedRewards,
    isSessionStarted,
    requestAmberImageGeneration,
    requestHybridImageGeneration,
    requestRewardImageGeneration,
    syncAmberImageStatus,
    syncHybridImageStatus,
    syncRewardImageStatus,
  ]);

  const advanceToNextProblem = useCallback(() => {
    const currentState = gameSessionRef.current;
    const nextSolvedByMode = incrementSolvedByMode(currentState);
    const next = resolveNextProblemAfterSolve(currentState);

    setGameSession({
      activeMode: next.mode,
      activeProblem: next.problem,
      steps: next.steps,
      sessionSolvedProblems: currentState.sessionSolvedProblems + 1,
      sessionAttemptedProblems: currentState.sessionAttemptedProblems + 1,
      totalProblemsSolved: currentState.totalProblemsSolved + 1,
      totalProblemsAttempted: currentState.totalProblemsAttempted + 1,
      solvedByMode: nextSolvedByMode,
      preferredGameMode: currentState.preferredGameMode,
      preferredDifficulty: currentState.preferredDifficulty,
      amberBalance:
        currentState.amberBalance +
        resolveAmberEarned(currentState.activeMode, currentState.preferredDifficulty),
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

    const shouldSwapActiveProblem = currentState.activeMode !== nextGameMode;
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

  // Fraction problems are not step-driven, so the panel reports completion
  // directly rather than through workspace step validation.
  const handleFractionProblemSolved = useCallback((problemId: string) => {
    if (completedProblemIdRef.current === problemId) {
      return;
    }

    completedProblemIdRef.current = problemId;
    setIsNextProblemReady(true);
  }, []);

  const activeLaneLabel =
    gameSession.activeMode === "fractions"
      ? "common divisor"
      : gameSession.activeMode === "multiplication"
        ? gameSession.steps[0]
          ? "partial product"
          : "ready"
        : formatActiveInputLane(gameSession.steps[0] ? "quotient" : null);
  const activeModeLabel =
    gameSession.activeMode === "fractions"
      ? "Fractions"
      : gameSession.activeMode === "multiplication"
        ? "Multiplication"
        : "Division";
  if (isBootSplashActive) {
    return (
      <main className="jurassic-shell">
        <div className="app-boot-splash" data-ui-surface="boot-splash" role="status">
          <BarbasolSpinner className="app-boot-spinner" />
          <p className="app-boot-splash-label">Loading...</p>
        </div>
      </main>
    );
  }

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
                Authenticate operator credentials to access the InGen math sequencers
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

              <label className="game-start-label" htmlFor="game-start-password">
                {authMode === "register" ? "Choose a password" : "Password"}
              </label>
              <input
                autoComplete={authMode === "register" ? "new-password" : "current-password"}
                className="game-start-input terminal-input"
                id="game-start-password"
                minLength={authMode === "register" ? MIN_PLAYER_PASSWORD_LENGTH : undefined}
                name="password"
                onChange={(event) => {
                  setPasswordDraft(event.target.value);
                  setSessionStartError(null);
                }}
                placeholder={
                  authMode === "register"
                    ? `At least ${MIN_PLAYER_PASSWORD_LENGTH} characters`
                    : "Enter your password"
                }
                required
                type="password"
                value={passwordDraft}
              />

              {authMode === "register" ? (
                <>
                  <label className="game-start-label" htmlFor="game-start-confirm-password">
                    Confirm password
                  </label>
                  <input
                    autoComplete="new-password"
                    className="game-start-input terminal-input"
                    id="game-start-confirm-password"
                    minLength={MIN_PLAYER_PASSWORD_LENGTH}
                    name="confirmPassword"
                    onChange={(event) => {
                      setConfirmPasswordDraft(event.target.value);
                      setSessionStartError(null);
                    }}
                    placeholder="Re-enter your password"
                    required
                    type="password"
                    value={confirmPasswordDraft}
                  />
                </>
              ) : null}

              {authMode === "register" ? (
                <p className="game-start-helper">
                  Use this Operator ID and password to log in later and resume your progress on
                  any device.
                </p>
              ) : null}

              <p className="game-start-helper auth-mode-switch">
                {authMode === "register" ? "Already have credentials? " : "New operator? "}
                <button
                  className="text-link-button"
                  data-ui-action="toggle-auth-mode"
                  disabled={isAuthenticating}
                  onClick={() => {
                    setAuthMode((previousMode) =>
                      previousMode === "register" ? "login" : "register",
                    );
                    setConfirmPasswordDraft("");
                    setSessionStartError(null);
                    setSessionStartStatus(null);
                  }}
                  type="button"
                >
                  {authMode === "register" ? "Log in instead" : "Register a new operator ID"}
                </button>
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
                <button
                  className="jp-button"
                  data-ui-action="start-session"
                  disabled={isAuthenticating}
                  type="submit"
                >
                  {isAuthenticating
                    ? "Authenticating..."
                    : authMode === "register"
                      ? "Register & Authenticate"
                      : "Authenticate Session"}
                </button>
              </div>
            </form>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="jurassic-shell">
      <div className="jurassic-content">
        <header className="jurassic-panel jurassic-hero motif-canopy">
          <div className="hero-top-row">
            <div
              className="hero-account-bar"
              data-ui-surface="account-bar"
              ref={accountMenuRef}
            >
              <button
                aria-controls="hero-account-menu"
                aria-expanded={isAccountMenuOpen}
                aria-haspopup="menu"
                className="hero-account-trigger"
                data-ui-action="toggle-account-menu"
                onClick={() => {
                  setIsAccountMenuOpen((isOpen) => !isOpen);
                }}
                type="button"
              >
                <span className="hero-account-operator" data-ui-surface="operator-badge">
                  <span className="hero-account-operator-prefix">Operator: </span>
                  {activePlayerName ?? "Operator"}
                </span>
                <span aria-hidden="true" className="hero-account-caret">
                  ▾
                </span>
              </button>
              {isAccountMenuOpen ? (
                <div className="hero-account-menu" id="hero-account-menu" role="menu">
                  <button
                    aria-haspopup="dialog"
                    className="text-link-button hero-account-link"
                    data-ui-action="open-change-password"
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      openChangePasswordModal();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    Change password
                  </button>
                  <button
                    className="text-link-button hero-account-link"
                    data-ui-action="logout"
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      void handleLogout();
                    }}
                    role="menuitem"
                    type="button"
                  >
                    Log out
                  </button>
                </div>
              ) : null}
              {accountNotice ? (
                <span className="hero-account-notice" role="status">
                  {accountNotice}
                </span>
              ) : null}
            </div>
            <p className="eyebrow">Dinosaur Genomic Sequencing Console</p>
          </div>
          <h1 className="hero-title">
            {gameSession.activeMode === "fractions"
              ? "InGen Fraction Dashboard"
              : gameSession.activeMode === "multiplication"
                ? "InGen Multiplication Dashboard"
                : "InGen Division Dashboard"}
          </h1>
          <div className="hero-stats-row" data-ui-surface="hero-stats">
            <span className="hero-stat-value">{gameSession.totalProblemsSolved}</span>
            <span className="hero-stat-label">problems solved</span>
            <span aria-hidden="true" className="hero-stat-divider">
              ·
            </span>
            <span className="hero-stat-value">{gameSession.sessionSolvedProblems}</span>
            <span className="hero-stat-label">this session</span>
          </div>
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
                  {gameSession.activeMode === "fractions"
                    ? "DNA Fraction Sequencer"
                    : gameSession.activeMode === "multiplication"
                      ? "DNA Multiplication Sequencer"
                      : "DNA Division Sequencer"}
                </h2>
              </div>
              {/* Screen-reader progress readout; the sighted dashboard shows
                  this data in the hero stats and amber counter instead. */}
              <p className="status-chip fraction-announcement">
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
                        +{resolveAmberEarned(gameSession.activeMode, option.value)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {gameSession.activeMode === "fractions" &&
            isFractionProblem(gameSession.activeProblem) ? (
              <FractionReductionPanel
                key={gameSession.activeProblem.id}
                onProblemSolved={handleFractionProblemSolved}
                problem={gameSession.activeProblem}
              />
            ) : gameSession.activeMode === "multiplication" &&
              isMultiplicationProblem(gameSession.activeProblem) ? (
              <LiveMultiplicationWorkspacePanel
                key={gameSession.activeProblem.id}
                multiplicand={gameSession.activeProblem.multiplicand}
                multiplicandDecimalPlaces={gameSession.activeProblem.multiplicandDecimalPlaces}
                multiplier={gameSession.activeProblem.multiplier}
                multiplierDecimalPlaces={gameSession.activeProblem.multiplierDecimalPlaces}
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
                  className="jp-button jp-button-cta"
                  data-ui-action="next-problem"
                  onClick={advanceToNextProblem}
                  ref={nextProblemButtonRef}
                  type="button"
                >
                  Next Problem
                  <span aria-hidden="true" className="jp-button-cta-arrow">
                    →
                  </span>
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
                  {isProvisionalRewardImagePath(gameSession.amberImagePath) ? (
                    <BarbasolSpinner className="amber-bank-spinner" />
                  ) : (
                    <Image
                      alt="Amber currency crystal"
                      className="amber-bank-image"
                      height={120}
                      loading="eager"
                      src={gameSession.amberImagePath}
                      width={120}
                    />
                  )}
                </div>
                <p className="amber-bank-balance" role="status">
                  {gameSession.amberBalance}
                  <span className="amber-bank-currency-word">amber</span>
                  {amberGain ? (
                    <span className="amber-gain-pop" key={amberGain.displayKey}>
                      +{amberGain.amount}
                    </span>
                  ) : null}
                </p>
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
                  disabled={
                    unlockedPrimaryDinosaurNames.length < 2 || !hasEnoughAmberForHybrid
                  }
                  onClick={openHybridLab}
                  type="button"
                >
                  Open Hybrid Lab ({AMBER_COST_PER_HYBRID_CREATION} Amber)
                </button>
              </div>
              {rewardGenerationNotice ? (
                <p className="amber-actions-notice" role="status">
                  {rewardGenerationNotice}
                </p>
              ) : null}

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
                      </button>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Hatching runs headless; the only UI is the unlock celebration modal.
                The gallery tile's spinner already shows an image still generating. */}
            <EarnedRewardRevealPanel
              autoOpenRevealModal={
                toRewardRevealIdentityKey(activeRewardReveal) !==
                restoredRewardRevealKey
              }
              dinosaurName={activeRewardReveal.dinosaurName}
              initialImagePath={activeRewardReveal.initialImagePath}
              initialStatus={activeRewardReveal.initialStatus}
              maxPollAttempts={20}
              milestoneSolvedCount={activeRewardReveal.milestoneSolvedCount}
              pollIntervalMs={600}
              presentation="modal-only"
            />
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
                            {isProvisionalRewardImagePath(pendingHybridFirstPreviewImagePath) ? (
                              <BarbasolSpinner className="hybrid-preview-spinner" />
                            ) : (
                              <Image
                                alt={`${pendingHybridFusionReward.firstDinosaurName} preview`}
                                className="hybrid-preview-image"
                                height={180}
                                loading="lazy"
                                src={pendingHybridFirstPreviewImagePath}
                                width={240}
                              />
                            )}
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
                            {isProvisionalRewardImagePath(pendingHybridSecondPreviewImagePath) ? (
                              <BarbasolSpinner className="hybrid-preview-spinner" />
                            ) : (
                              <Image
                                alt={`${pendingHybridFusionReward.secondDinosaurName} preview`}
                                className="hybrid-preview-image"
                                height={180}
                                loading="lazy"
                                src={pendingHybridSecondPreviewImagePath}
                                width={240}
                              />
                            )}
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
                        <BarbasolSpinner className="hybrid-fusion-spinner" />
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
                              isProvisionalRewardImagePath(firstHybridPreviewImagePath) ? (
                                <BarbasolSpinner className="hybrid-preview-spinner" />
                              ) : (
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
                                  width={240}
                                />
                              )
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
                              isProvisionalRewardImagePath(secondHybridPreviewImagePath) ? (
                                <BarbasolSpinner className="hybrid-preview-spinner" />
                              ) : (
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
                                  width={240}
                                />
                              )
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

      {isChangePasswordOpen && modalHost
        ? createPortal(
            <div
              className="jp-modal-backdrop"
              data-ui-surface="change-password-modal"
              onClick={closeChangePasswordModal}
              role="presentation"
            >
              <div className="jp-modal-aura">
                <section
                  aria-labelledby="change-password-heading"
                  aria-modal="true"
                  className="jp-modal change-password-modal"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  role="dialog"
                >
                  <p className="surface-kicker">Operator Credentials</p>
                  <h3 className="surface-title" id="change-password-heading">
                    Change Password
                  </h3>
                  <p className="hybrid-lab-copy">
                    Confirm the current password for {activePlayerName}, then choose a new one.
                    Other devices logged in as this operator will need to log in again.
                  </p>

                  <form className="game-start-flow" onSubmit={handleChangePassword}>
                    <label className="game-start-label" htmlFor="change-password-current">
                      Current password
                    </label>
                    <input
                      autoComplete="current-password"
                      autoFocus
                      className="game-start-input terminal-input"
                      disabled={isChangingPassword}
                      id="change-password-current"
                      name="currentPassword"
                      onChange={(event) => {
                        setCurrentPasswordDraft(event.target.value);
                        setChangePasswordError(null);
                      }}
                      required
                      type="password"
                      value={currentPasswordDraft}
                    />

                    <label className="game-start-label" htmlFor="change-password-new">
                      New password
                    </label>
                    <input
                      autoComplete="new-password"
                      className="game-start-input terminal-input"
                      disabled={isChangingPassword}
                      id="change-password-new"
                      minLength={MIN_PLAYER_PASSWORD_LENGTH}
                      name="newPassword"
                      onChange={(event) => {
                        setNewPasswordDraft(event.target.value);
                        setChangePasswordError(null);
                      }}
                      placeholder={`At least ${MIN_PLAYER_PASSWORD_LENGTH} characters`}
                      required
                      type="password"
                      value={newPasswordDraft}
                    />

                    <label className="game-start-label" htmlFor="change-password-confirm">
                      Confirm new password
                    </label>
                    <input
                      autoComplete="new-password"
                      className="game-start-input terminal-input"
                      disabled={isChangingPassword}
                      id="change-password-confirm"
                      minLength={MIN_PLAYER_PASSWORD_LENGTH}
                      name="confirmNewPassword"
                      onChange={(event) => {
                        setConfirmNewPasswordDraft(event.target.value);
                        setChangePasswordError(null);
                      }}
                      required
                      type="password"
                      value={confirmNewPasswordDraft}
                    />

                    {changePasswordError ? (
                      <p className="game-start-error" role="alert">
                        {changePasswordError}
                      </p>
                    ) : null}

                    <div className="hybrid-lab-actions">
                      <button
                        className="jp-button jp-button-secondary"
                        disabled={isChangingPassword}
                        onClick={closeChangePasswordModal}
                        type="button"
                      >
                        Cancel
                      </button>
                      <button
                        className="jp-button"
                        data-ui-action="submit-change-password"
                        disabled={isChangingPassword}
                        type="submit"
                      >
                        {isChangingPassword ? "Updating..." : "Update Password"}
                      </button>
                    </div>
                  </form>
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
    </main>
  );
}
