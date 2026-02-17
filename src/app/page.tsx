 "use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { featureModules } from "@/features/registry";
import {
  generateDivisionProblemForSolvedCount,
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
      imagePath: "/rewards/tyrannosaurus-rex.png",
      earnedAt: "2026-02-12T09:15:00.000Z",
      milestoneSolvedCount: 5,
    },
    {
      rewardId: "reward-raptor-2",
      dinosaurName: "Velociraptor",
      imagePath: "/rewards/velociraptor.png",
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
  dividend: 432,
  divisor: 12,
  allowRemainder: false,
  difficultyLevel: 2,
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

const INITIAL_TOTAL_PROBLEMS_SOLVED = 14;
const INITIAL_TOTAL_PROBLEMS_ATTEMPTED = 16;
const INITIAL_SESSION_PROBLEMS_SOLVED = 0;
const INITIAL_SESSION_PROBLEMS_ATTEMPTED = 1;
const NEAR_MILESTONE_PREFETCH_PROBLEM_NUMBERS = [3, 4] as const;

function toRewardImageSlug(dinosaurName: string): string {
  const slug = dinosaurName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "reward-image";
}

function toRewardImagePath(dinosaurName: string): string {
  return `/rewards/${toRewardImageSlug(dinosaurName)}.png`;
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
    imagePath: toRewardImagePath(dinosaurName),
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
  const problem = generateDivisionProblemForSolvedCount({
    totalProblemsSolved,
    remainderMode: "allow",
  });
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
  const gameSessionRef = useRef<LiveGameSessionState>(gameSession);
  const completedProblemIdRef = useRef<string | null>(null);
  const rewardGenerationInFlightRef = useRef<Record<string, true>>({});

  useEffect(() => {
    gameSessionRef.current = gameSession;
  }, [gameSession]);

  useEffect(() => {
    completedProblemIdRef.current = null;
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
      if (
        normalizedDinosaurName.length === 0 ||
        rewardGenerationInFlightRef.current[normalizedDinosaurName]
      ) {
        return;
      }

      rewardGenerationInFlightRef.current[normalizedDinosaurName] = true;

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

        if (!response.ok) {
          const responseBody = (await response.json().catch(() => null)) as
            | { error?: { message?: string } }
            | null;
          const errorMessage =
            responseBody?.error?.message ??
            `Reward generation request failed with status ${response.status}.`;
          setRewardGenerationNotice(errorMessage);
          return;
        }

        await syncRewardImageStatus(normalizedDinosaurName);
        setRewardGenerationNotice(null);
      } catch {
        setRewardGenerationNotice(
          "Reward generation request failed before reaching the server.",
        );
      } finally {
        delete rewardGenerationInFlightRef.current[normalizedDinosaurName];
      }
    },
    [syncRewardImageStatus],
  );

  useEffect(() => {
    for (const unlockedReward of gameSessionRef.current.unlockedRewards) {
      void requestRewardImageGeneration(unlockedReward.dinosaurName);
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

      let unlockedRewardForGeneration: UnlockedReward | null = null;
      let prefetchTargetDinosaurName: string | null = null;

      setGameSession((currentState) => {
        const completedProblemId = currentState.activeProblem.id;
        if (!validation.currentStepId.startsWith(`${completedProblemId}:`)) {
          return currentState;
        }

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
    },
    [requestRewardImageGeneration],
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
          <p className="hero-copy">
            Earth-tone surfaces, jungle overlays, and amber-glow focus states now span the live game board, reward
            gallery, and save/load controls for both handheld and desktop play.
          </p>
          <div className="hero-badges">
            <span className="jp-badge">Earth + Jungle Palette</span>
            <span className="jp-badge">Themed Typography</span>
            <span className="jp-badge">Motif Overlays</span>
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
                  Amber Glow Division Board
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

        <section aria-labelledby="module-map-heading" className="jurassic-panel module-map">
          <h2 className="surface-title" id="module-map-heading">
            Feature Module Map
          </h2>
          <ul className="module-grid">
            {featureModules.map((module) => (
              <li className="module-card" key={module.id}>
                <p className="module-title">{module.title}</p>
                <p className="module-summary">{module.summary}</p>
                <p className="module-path">{module.rootPath}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
