 "use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  generateDivisionProblem,
  getDigitCount,
  solveLongDivision,
  type LongDivisionStepValidationResult,
} from "@/features/division-engine";
import { DinoGalleryPanel } from "@/features/gallery/components/dino-gallery-panel";
import {
  SAVE_FILE_SCHEMA_VERSION,
  type ActiveInputLane,
  type DinoDivisionSaveFile,
  type DivisionProblem,
  type LongDivisionStep,
  type UnlockedReward,
} from "@/features/contracts";
import { GameStartFlowPanel } from "@/features/persistence/components/game-start-flow-panel";
import { EarnedRewardRevealPanel } from "@/features/rewards/components/earned-reward-reveal-panel";
import {
  fetchEarnedRewardImageStatus,
  type EarnedRewardImageStatus,
} from "@/features/rewards/lib/earned-reward-reveal";
import {
  REWARD_UNLOCK_INTERVAL,
  getDinosaurForRewardNumber,
  getMilestoneSolvedCountForRewardNumber,
  getRewardNumberForSolvedCount,
} from "@/features/rewards/lib/dinosaurs";
import { LiveDivisionWorkspacePanel } from "@/features/workspace-ui/components/live-division-workspace-panel";

const PROVISIONAL_REWARD_IMAGE_PATH = "/window.svg";

const loadableSavePreview: DinoDivisionSaveFile = {
  schemaVersion: SAVE_FILE_SCHEMA_VERSION,
  playerName: "Raptor Scout",
  totalProblemsSolved: 28,
  currentDifficultyLevel: 4,
  progress: {
    session: {
      sessionId: "session-preview-active",
      startedAt: "2026-02-17T09:15:00.000Z",
      solvedProblems: 6,
      attemptedProblems: 8,
    },
    lifetime: {
      totalProblemsSolved: 28,
      totalProblemsAttempted: 34,
      currentDifficultyLevel: 4,
      rewardsUnlocked: 5,
    },
  },
  unlockedDinosaurs: [
    {
      rewardId: "reward-rex-1",
      dinosaurName: "Tyrannosaurus Rex",
      imagePath: PROVISIONAL_REWARD_IMAGE_PATH,
      earnedAt: "2026-02-12T09:15:00.000Z",
      milestoneSolvedCount: 5,
    },
    {
      rewardId: "reward-raptor-2",
      dinosaurName: "Velociraptor",
      imagePath: PROVISIONAL_REWARD_IMAGE_PATH,
      earnedAt: "2026-02-14T12:40:00.000Z",
      milestoneSolvedCount: 10,
    },
  ],
  sessionHistory: [
    {
      sessionId: "session-preview-1",
      startedAt: "2026-02-12T08:00:00.000Z",
      endedAt: "2026-02-12T08:45:00.000Z",
      solvedProblems: 10,
      attemptedProblems: 12,
    },
    {
      sessionId: "session-preview-2",
      startedAt: "2026-02-14T12:00:00.000Z",
      endedAt: "2026-02-14T12:55:00.000Z",
      solvedProblems: 18,
      attemptedProblems: 22,
    },
  ],
  updatedAt: "2026-02-17T09:15:00.000Z",
};

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
  unlockedRewards: readonly UnlockedReward[];
}

interface ActiveRewardRevealState {
  dinosaurName: string;
  milestoneSolvedCount: number;
  initialStatus: EarnedRewardImageStatus;
  initialImagePath: string | null;
}

const INITIAL_TOTAL_PROBLEMS_SOLVED = 0;
const INITIAL_TOTAL_PROBLEMS_ATTEMPTED = 0;
const INITIAL_SESSION_PROBLEMS_SOLVED = 0;
const INITIAL_SESSION_PROBLEMS_ATTEMPTED = 0;
const NEAR_MILESTONE_PREFETCH_PROBLEM_NUMBERS = [3, 4] as const;
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

function resolveNextRewardNumber(totalProblemsSolved: number): number {
  return getRewardNumberForSolvedCount(totalProblemsSolved, REWARD_UNLOCK_INTERVAL) + 1;
}

function resolveNextRewardTarget(totalProblemsSolved: number): {
  rewardNumber: number;
  dinosaurName: string;
  milestoneSolvedCount: number;
} {
  const rewardNumber = resolveNextRewardNumber(totalProblemsSolved);
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

function resolveProblemNumberWithinRewardInterval(totalProblemsSolved: number): number {
  return (totalProblemsSolved % REWARD_UNLOCK_INTERVAL) + 1;
}

function shouldTriggerNearMilestonePrefetch(totalProblemsSolved: number): boolean {
  const problemNumberWithinRewardInterval =
    resolveProblemNumberWithinRewardInterval(totalProblemsSolved);

  return (
    problemNumberWithinRewardInterval ===
      NEAR_MILESTONE_PREFETCH_PROBLEM_NUMBERS[0] ||
    problemNumberWithinRewardInterval ===
      NEAR_MILESTONE_PREFETCH_PROBLEM_NUMBERS[1]
  );
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

  if (!problem) {
    throw new Error(
      `Unable to generate constrained live problem with a ${LIVE_PROBLEM_DIVIDEND_DIGITS}-digit dividend and divisor in [${LIVE_PROBLEM_MIN_DIVISOR}, ${LIVE_PROBLEM_MAX_DIVISOR}].`,
    );
  }

  const solution = solveLongDivision(problem);

  return {
    problem,
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
  unlockedRewards: loadableSavePreview.unlockedDinosaurs,
};

const initialActiveRewardRevealState: ActiveRewardRevealState = {
  ...resolveNextRewardTarget(INITIAL_TOTAL_PROBLEMS_SOLVED),
  initialStatus: "missing",
  initialImagePath: null,
};

export default function Home() {
  const [gameSession, setGameSession] = useState<LiveGameSessionState>(
    initialLiveGameSessionState,
  );
  const [activeRewardReveal, setActiveRewardReveal] =
    useState<ActiveRewardRevealState>(initialActiveRewardRevealState);
  const [rewardGenerationNotice, setRewardGenerationNotice] =
    useState<string | null>(null);
  const [isNextProblemReady, setIsNextProblemReady] = useState(false);
  const gameSessionRef = useRef<LiveGameSessionState>(gameSession);
  const completedProblemIdRef = useRef<string | null>(null);

  useEffect(() => {
    gameSessionRef.current = gameSession;
  }, [gameSession]);

  useEffect(() => {
    completedProblemIdRef.current = null;
    setIsNextProblemReady(false);
  }, [gameSession.activeProblem.id]);

  const syncRewardImageStatus = useCallback(async (dinosaurName: string) => {
    const normalizedDinosaurName = dinosaurName.trim();
    if (normalizedDinosaurName.length === 0) {
      return;
    }

    const statusSnapshot = await fetchEarnedRewardImageStatus({
      dinosaurName: normalizedDinosaurName,
    });
    if (statusSnapshot.status !== "ready" || !statusSnapshot.imagePath) {
      return;
    }

    setGameSession((currentState) => {
      let didChange = false;
      const nextUnlockedRewards = currentState.unlockedRewards.map((reward) => {
        if (
          reward.dinosaurName !== normalizedDinosaurName ||
          reward.imagePath === statusSnapshot.imagePath
        ) {
          return reward;
        }

        didChange = true;
        return {
          ...reward,
          imagePath: statusSnapshot.imagePath,
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
      if (currentReveal.dinosaurName !== normalizedDinosaurName) {
        return currentReveal;
      }

      return {
        ...currentReveal,
        initialStatus: "ready",
        initialImagePath: statusSnapshot.imagePath,
      };
    });
  }, []);

  const requestRewardImageGeneration = useCallback(
    async (dinosaurName: string) => {
      const normalizedDinosaurName = dinosaurName.trim();
      if (normalizedDinosaurName.length === 0) {
        return;
      }

      try {
        const response = await fetch("/api/rewards/generate-image", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            dinosaurName: normalizedDinosaurName,
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
          return;
        }

        const resolvedDinosaurName =
          responseBody?.data?.dinosaurName?.trim() || normalizedDinosaurName;
        const resolvedImagePath = toRewardImagePathFromMimeType(
          resolvedDinosaurName,
          responseBody?.data?.mimeType?.trim() ?? null,
        );

        setGameSession((currentState) => {
          let didChange = false;
          const nextUnlockedRewards = currentState.unlockedRewards.map((reward) => {
            if (
              reward.dinosaurName !== resolvedDinosaurName ||
              reward.imagePath === resolvedImagePath
            ) {
              return reward;
            }

            didChange = true;
            return {
              ...reward,
              imagePath: resolvedImagePath,
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
          if (currentReveal.dinosaurName !== resolvedDinosaurName) {
            return currentReveal;
          }

          return {
            ...currentReveal,
            initialStatus: "ready",
            initialImagePath: resolvedImagePath,
          };
        });

        await syncRewardImageStatus(resolvedDinosaurName);
        setRewardGenerationNotice(null);
      } catch {
        setRewardGenerationNotice(
          "Reward generation request failed before reaching the server.",
        );
      }
    },
    [syncRewardImageStatus],
  );

  useEffect(() => {
    for (const unlockedReward of gameSession.unlockedRewards) {
      void requestRewardImageGeneration(unlockedReward.dinosaurName);
    }
  }, [gameSession.unlockedRewards, requestRewardImageGeneration]);

  const advanceToNextProblem = useCallback(() => {
    let unlockedRewardForGeneration: UnlockedReward | null = null;
    let prefetchTargetDinosaurName: string | null = null;

    setGameSession((currentState) => {
      const nextTotalProblemsSolved = currentState.totalProblemsSolved + 1;
      const nextUnlockedRewards = [...currentState.unlockedRewards];
      const nextEarnedRewardNumber = getRewardNumberForSolvedCount(
        nextTotalProblemsSolved,
        REWARD_UNLOCK_INTERVAL,
      );

      if (nextEarnedRewardNumber > nextUnlockedRewards.length) {
        const unlockedReward = createUnlockedReward(
          nextEarnedRewardNumber,
          new Date().toISOString(),
        );
        nextUnlockedRewards.push(unlockedReward);
        unlockedRewardForGeneration = unlockedReward;
      }

      const { problem: nextProblem, steps: nextSteps } =
        resolveNextLiveProblem(nextTotalProblemsSolved);
      if (shouldTriggerNearMilestonePrefetch(nextTotalProblemsSolved)) {
        prefetchTargetDinosaurName = resolveNextRewardTarget(
          nextTotalProblemsSolved,
        ).dinosaurName;
      }

      return {
        activeProblem: nextProblem,
        steps: nextSteps,
        sessionSolvedProblems: currentState.sessionSolvedProblems + 1,
        sessionAttemptedProblems: currentState.sessionAttemptedProblems + 1,
        totalProblemsSolved: nextTotalProblemsSolved,
        totalProblemsAttempted: currentState.totalProblemsAttempted + 1,
        unlockedRewards: nextUnlockedRewards,
      };
    });

    setIsNextProblemReady(false);

    if (unlockedRewardForGeneration) {
      setActiveRewardReveal({
        dinosaurName: unlockedRewardForGeneration.dinosaurName,
        milestoneSolvedCount: unlockedRewardForGeneration.milestoneSolvedCount,
        initialStatus: "generating",
        initialImagePath: null,
      });
      void requestRewardImageGeneration(unlockedRewardForGeneration.dinosaurName);
    }

    if (prefetchTargetDinosaurName) {
      void requestRewardImageGeneration(prefetchTargetDinosaurName);
    }
  }, [requestRewardImageGeneration]);

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
                Live target: {activeLaneLabel} | Solved: {gameSession.totalProblemsSolved}
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

              <DinoGalleryPanel unlockedRewards={gameSession.unlockedRewards} />
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

            <section
              aria-labelledby="save-surface-heading"
              className="jurassic-panel motif-track"
              data-ui-surface="save-load"
            >
              <div className="surface-header">
                <div>
                  <p className="surface-kicker">Save + Load</p>
                  <h2 className="surface-title" id="save-surface-heading">
                    Expedition Files
                  </h2>
                </div>
              </div>

              <GameStartFlowPanel loadableSave={loadableSavePreview} />
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
