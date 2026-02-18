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
import { DinoGalleryPanel } from "@/features/gallery/components/dino-gallery-panel";
import {
  type ActiveInputLane,
  type DivisionProblem,
  type LongDivisionStep,
  type UnlockedHybridReward,
  type UnlockedReward,
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
} from "@/features/rewards/lib/dino-dossiers";
import { LiveDivisionWorkspacePanel } from "@/features/workspace-ui/components/live-division-workspace-panel";
import {
  normalizePlayerProfileName,
  readPlayerProfileSnapshot,
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

interface LiveGameSessionState {
  activeProblem: DivisionProblem;
  steps: readonly LongDivisionStep[];
  sessionSolvedProblems: number;
  sessionAttemptedProblems: number;
  totalProblemsSolved: number;
  totalProblemsAttempted: number;
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

interface PersistedPlayerProfileSnapshot {
  gameSession: LiveGameSessionState;
  activeRewardReveal: ActiveRewardRevealState;
}

const INITIAL_TOTAL_PROBLEMS_SOLVED = 0;
const INITIAL_TOTAL_PROBLEMS_ATTEMPTED = 0;
const INITIAL_SESSION_PROBLEMS_SOLVED = 0;
const INITIAL_SESSION_PROBLEMS_ATTEMPTED = 0;
const AMBER_EARNED_PER_SOLVED_PROBLEM = 1;
const AMBER_COST_PER_DINO_UNLOCK = 5;
const AMBER_COST_PER_HYBRID_CREATION = 2;
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

function isPersistedPlayerProfileSnapshot(
  value: unknown,
): value is PersistedPlayerProfileSnapshot {
  if (!value || typeof value !== "object") {
    return false;
  }

  const snapshot = value as Partial<PersistedPlayerProfileSnapshot>;
  if (!snapshot.gameSession || typeof snapshot.gameSession !== "object") {
    return false;
  }
  if (!snapshot.gameSession.activeProblem || typeof snapshot.gameSession.activeProblem !== "object") {
    return false;
  }
  if (
    typeof snapshot.gameSession.activeProblem.id !== "string" ||
    typeof snapshot.gameSession.activeProblem.dividend !== "number" ||
    typeof snapshot.gameSession.activeProblem.divisor !== "number"
  ) {
    return false;
  }
  if (
    typeof snapshot.gameSession.sessionSolvedProblems !== "number" ||
    typeof snapshot.gameSession.sessionAttemptedProblems !== "number"
  ) {
    return false;
  }
  if (
    typeof snapshot.gameSession.totalProblemsSolved !== "number" ||
    typeof snapshot.gameSession.totalProblemsAttempted !== "number"
  ) {
    return false;
  }
  if (!Array.isArray(snapshot.gameSession.steps)) {
    return false;
  }
  if (!Array.isArray(snapshot.gameSession.unlockedRewards)) {
    return false;
  }
  if (
    "amberBalance" in snapshot.gameSession &&
    typeof snapshot.gameSession.amberBalance !== "number"
  ) {
    return false;
  }
  if (
    "amberImagePath" in snapshot.gameSession &&
    snapshot.gameSession.amberImagePath !== null &&
    typeof snapshot.gameSession.amberImagePath !== "string"
  ) {
    return false;
  }
  if (
    "unlockedHybrids" in snapshot.gameSession &&
    !Array.isArray(snapshot.gameSession.unlockedHybrids)
  ) {
    return false;
  }
  if (Array.isArray(snapshot.gameSession.unlockedHybrids)) {
    for (const unlockedHybrid of snapshot.gameSession.unlockedHybrids) {
      if (!isUnlockedHybridReward(unlockedHybrid)) {
        return false;
      }
    }
  }
  if (!snapshot.activeRewardReveal || typeof snapshot.activeRewardReveal !== "object") {
    return false;
  }
  if (typeof snapshot.activeRewardReveal.dinosaurName !== "string") {
    return false;
  }
  if (typeof snapshot.activeRewardReveal.milestoneSolvedCount !== "number") {
    return false;
  }
  if (
    snapshot.activeRewardReveal.initialStatus !== "missing" &&
    snapshot.activeRewardReveal.initialStatus !== "generating" &&
    snapshot.activeRewardReveal.initialStatus !== "ready"
  ) {
    return false;
  }
  if (
    snapshot.activeRewardReveal.initialImagePath !== null &&
    typeof snapshot.activeRewardReveal.initialImagePath !== "string"
  ) {
    return false;
  }

  return true;
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
  activeProblem: workspacePreviewProblem,
  steps: workspacePreviewSolution.steps,
  sessionSolvedProblems: INITIAL_SESSION_PROBLEMS_SOLVED,
  sessionAttemptedProblems: INITIAL_SESSION_PROBLEMS_ATTEMPTED,
  totalProblemsSolved: INITIAL_TOTAL_PROBLEMS_SOLVED,
  totalProblemsAttempted: INITIAL_TOTAL_PROBLEMS_ATTEMPTED,
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
    activeProblem: workspacePreviewProblem,
    steps: workspacePreviewSolution.steps,
    sessionSolvedProblems: INITIAL_SESSION_PROBLEMS_SOLVED,
    sessionAttemptedProblems: INITIAL_SESSION_PROBLEMS_ATTEMPTED,
    totalProblemsSolved: INITIAL_TOTAL_PROBLEMS_SOLVED,
    totalProblemsAttempted: INITIAL_TOTAL_PROBLEMS_ATTEMPTED,
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
  persistedState: LiveGameSessionState,
): LiveGameSessionState {
  return {
    ...persistedState,
    amberBalance:
      typeof persistedState.amberBalance === "number"
        ? toNonNegativeInteger(persistedState.amberBalance)
        : toNonNegativeInteger(persistedState.totalProblemsSolved),
    amberImagePath:
      persistedState.amberImagePath === null
        ? null
        : toTrimmedValue(persistedState.amberImagePath),
    unlockedHybrids: normalizeUnlockedHybridRewardsForSession(
      (persistedState as Partial<LiveGameSessionState>).unlockedHybrids,
    ),
  };
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
  const [rewardGenerationNotice, setRewardGenerationNotice] =
    useState<string | null>(null);
  const [isNextProblemReady, setIsNextProblemReady] = useState(false);
  const [isHybridLabOpen, setIsHybridLabOpen] = useState(false);
  const [hybridLabFirstDinosaurName, setHybridLabFirstDinosaurName] = useState("");
  const [hybridLabSecondDinosaurName, setHybridLabSecondDinosaurName] = useState("");
  const [hybridLabError, setHybridLabError] = useState<string | null>(null);
  const [selectedHybridReward, setSelectedHybridReward] =
    useState<UnlockedHybridReward | null>(null);
  const gameSessionRef = useRef<LiveGameSessionState>(gameSession);
  const completedProblemIdRef = useRef<string | null>(null);
  const nextProblemButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    gameSessionRef.current = gameSession;
  }, [gameSession]);

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
  const selectedHybridDossier = useMemo(() => {
    if (!selectedHybridReward) {
      return null;
    }

    return buildHybridDinosaurDossier({
      firstDinosaurName: selectedHybridReward.firstDinosaurName,
      secondDinosaurName: selectedHybridReward.secondDinosaurName,
    });
  }, [selectedHybridReward]);
  const canUnlockNextDinosaurWithAmber =
    gameSession.amberBalance >= AMBER_COST_PER_DINO_UNLOCK;
  const hasEnoughAmberForHybrid = gameSession.amberBalance >= AMBER_COST_PER_HYBRID_CREATION;
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
    if (!isHybridLabOpen && !selectedHybridReward) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") {
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
  }, [isHybridLabOpen, selectedHybridReward]);

  const handleStartSession = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setSessionStartError(null);
      setSessionStartStatus(null);
      setRewardGenerationNotice(null);

      try {
        const normalizedPlayerName = normalizePlayerProfileName(playerNameDraft);
        const persistedProfile = readPlayerProfileSnapshot<PersistedPlayerProfileSnapshot>(
          window.localStorage,
          normalizedPlayerName,
        );

        if (persistedProfile && isPersistedPlayerProfileSnapshot(persistedProfile.snapshot)) {
          const hydratedSession = hydrateLiveGameSessionState(
            persistedProfile.snapshot.gameSession,
          );
          setGameSession(hydratedSession);
          setActiveRewardReveal(persistedProfile.snapshot.activeRewardReveal);
          setSessionStartStatus(
            `Loaded ${persistedProfile.playerName}'s profile from this browser.`,
          );
        } else {
          const freshSession = createFreshLiveGameSessionState();
          setGameSession(freshSession);
          setActiveRewardReveal({
            ...resolveNextRewardTarget(freshSession.unlockedRewards.length),
            initialStatus: "missing",
            initialImagePath: null,
          });
          setSessionStartStatus("Started a new profile for this player.");
        }

        completedProblemIdRef.current = null;
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
    [playerNameDraft],
  );

  useEffect(() => {
    if (!isSessionStarted || !activePlayerName) {
      return;
    }

    const playerProfileSnapshot: PersistedPlayerProfileSnapshot = {
      gameSession,
      activeRewardReveal,
    };

    try {
      writePlayerProfileSnapshot(
        window.localStorage,
        activePlayerName,
        playerProfileSnapshot,
      );
    } catch (error) {
      console.error("Failed to persist player profile to localStorage.", error);
    }
  }, [activePlayerName, activeRewardReveal, gameSession, isSessionStarted]);

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
        const resolvedImagePath = toRewardImagePathFromMimeType(
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
    async (hybridReward: UnlockedHybridReward) => {
      const generationResult = await requestGeneratedImage({
        assetName: hybridReward.generationAssetName,
      });
      if (!generationResult) {
        return;
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

      await syncHybridImageStatus(hybridReward);
      setRewardGenerationNotice(null);
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
    const nextTotalProblemsSolved = currentState.totalProblemsSolved + 1;
    const { problem: nextProblem, steps: nextSteps } =
      resolveNextLiveProblem(nextTotalProblemsSolved);

    setGameSession({
      activeProblem: nextProblem,
      steps: nextSteps,
      sessionSolvedProblems: currentState.sessionSolvedProblems + 1,
      sessionAttemptedProblems: currentState.sessionAttemptedProblems + 1,
      totalProblemsSolved: nextTotalProblemsSolved,
      totalProblemsAttempted: currentState.totalProblemsAttempted + 1,
      amberBalance:
        currentState.amberBalance + AMBER_EARNED_PER_SOLVED_PROBLEM,
      amberImagePath: currentState.amberImagePath,
      unlockedRewards: currentState.unlockedRewards,
      unlockedHybrids: currentState.unlockedHybrids,
    });

    setIsNextProblemReady(false);
    if (!currentState.amberImagePath) {
      void requestAmberImageGeneration();
    }
  }, [requestAmberImageGeneration]);

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
    setSelectedHybridReward(null);
    setIsHybridLabOpen(true);
  }, []);

  const closeHybridLab = useCallback(() => {
    setHybridLabError(null);
    setHybridLabFirstDinosaurName("");
    setHybridLabSecondDinosaurName("");
    setIsHybridLabOpen(false);
  }, []);

  const handleCreateHybrid = useCallback(() => {
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
    setIsHybridLabOpen(false);
    setRewardGenerationNotice(null);
    void requestHybridImageGeneration(unlockedHybridReward);
  }, [
    hybridLabFirstDinosaurName,
    hybridLabSecondDinosaurName,
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

  const activeLaneLabel = formatActiveInputLane(
    gameSession.steps[0] ? "quotient" : null,
  );
  if (!isSessionStarted) {
    return (
      <main className="jurassic-shell">
        <div className="jurassic-content">
          <header className="jurassic-panel jurassic-hero motif-canopy">
            <p className="eyebrow">Dino Division v2</p>
            <h1 className="hero-title">Jurassic Command Deck</h1>
          </header>

          <section
            aria-labelledby="player-start-heading"
            className="jurassic-panel player-start-panel"
            data-ui-surface="player-start"
          >
            <div className="surface-header">
              <div>
                <p className="surface-kicker">Player Profile</p>
                <h2 className="surface-title" id="player-start-heading">
                  Start Sequencing
                </h2>
              </div>
            </div>

            <form className="game-start-flow" onSubmit={handleStartSession}>
              <label className="game-start-label" htmlFor="game-start-player-name">
                Player Name
              </label>
              <input
                autoComplete="name"
                className="game-start-input"
                id="game-start-player-name"
                name="playerName"
                onChange={(event) => {
                  setPlayerNameDraft(event.target.value);
                  setSessionStartError(null);
                }}
                placeholder="Enter your dino wrangler name"
                required
                type="text"
                value={playerNameDraft}
              />

              <p className="game-start-helper">
                Profiles are auto-saved in this browser by lowercase player name.
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
                  Start Sequencing
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
          <p className="eyebrow">Dino Division v2</p>
          <h1 className="hero-title">Jurassic Command Deck</h1>
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
                  DNA Division Sequencer
                </h2>
              </div>
              <p className="status-chip">
                Live target: {activeLaneLabel} | Player: {activePlayerName} | Solved:{" "}
                {gameSession.totalProblemsSolved} | Amber: {gameSession.amberBalance}
              </p>
            </div>

            <LiveDivisionWorkspacePanel
              key={gameSession.activeProblem.id}
              dividend={gameSession.activeProblem.dividend}
              divisor={gameSession.activeProblem.divisor}
              onStepValidation={handleWorkspaceStepValidation}
              steps={gameSession.steps}
            />
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
                    Each solved problem adds +{AMBER_EARNED_PER_SOLVED_PROBLEM} amber.
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

                  {hybridLabError ? (
                    <p className="game-start-error" role="alert">
                      {hybridLabError}
                    </p>
                  ) : null}

                  <div className="hybrid-lab-actions">
                    <button className="jp-button jp-button-secondary" onClick={closeHybridLab} type="button">
                      Close
                    </button>
                    <button
                      className="jp-button"
                      data-ui-action="create-hybrid"
                      disabled={
                        !hasAvailableHybridPairs ||
                        hybridLabFirstDinosaurName.length === 0 ||
                        hybridLabSecondDinosaurName.length === 0 ||
                        !hasEnoughAmberForHybrid
                      }
                      onClick={handleCreateHybrid}
                      type="button"
                    >
                      Create Hybrid
                    </button>
                  </div>
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
                  className="jp-modal gallery-detail-modal"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  role="dialog"
                >
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
