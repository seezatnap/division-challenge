 "use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

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
  getRewardNumberForSolvedCount,
} from "@/features/rewards/lib/dinosaurs";
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
  unlockedRewards: readonly UnlockedReward[];
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
  unlockedRewards: [],
};

const initialActiveRewardRevealState: ActiveRewardRevealState = {
  ...resolveNextRewardTarget(INITIAL_TOTAL_PROBLEMS_SOLVED),
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
    unlockedRewards: [],
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
          setGameSession(persistedProfile.snapshot.gameSession);
          setActiveRewardReveal(persistedProfile.snapshot.activeRewardReveal);
          setSessionStartStatus(
            `Loaded ${persistedProfile.playerName}'s profile from this browser.`,
          );
        } else {
          setGameSession(createFreshLiveGameSessionState());
          setActiveRewardReveal({
            ...resolveNextRewardTarget(INITIAL_TOTAL_PROBLEMS_SOLVED),
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

  const syncRewardImageStatus = useCallback(async (dinosaurName: string) => {
    const normalizedDinosaurName = dinosaurName.trim();
    if (normalizedDinosaurName.length === 0) {
      return;
    }

    const statusSnapshot = await fetchEarnedRewardImageStatus({
      dinosaurName: normalizedDinosaurName,
    });
    const readyImagePath = statusSnapshot.imagePath;
    if (statusSnapshot.status !== "ready" || !readyImagePath) {
      return;
    }

    setGameSession((currentState) => {
      let didChange = false;
      const nextUnlockedRewards = currentState.unlockedRewards.map((reward) => {
        if (
          reward.dinosaurName !== normalizedDinosaurName ||
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
      if (currentReveal.dinosaurName !== normalizedDinosaurName) {
        return currentReveal;
      }

      return {
        ...currentReveal,
        initialStatus: "ready",
        initialImagePath: readyImagePath,
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
    if (!isSessionStarted) {
      return;
    }

    for (const unlockedReward of gameSession.unlockedRewards) {
      void requestRewardImageGeneration(unlockedReward.dinosaurName);
    }
  }, [gameSession.unlockedRewards, isSessionStarted, requestRewardImageGeneration]);

  const advanceToNextProblem = useCallback(() => {
    const currentState = gameSessionRef.current;
    const nextTotalProblemsSolved = currentState.totalProblemsSolved + 1;
    const nextUnlockedRewards = [...currentState.unlockedRewards];
    const nextEarnedRewardNumber = getRewardNumberForSolvedCount(
      nextTotalProblemsSolved,
      REWARD_UNLOCK_INTERVAL,
    );
    let unlockedRewardForGeneration: UnlockedReward | null = null;

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
    const prefetchTargetDinosaurName = shouldTriggerNearMilestonePrefetch(
      nextTotalProblemsSolved,
    )
      ? resolveNextRewardTarget(nextTotalProblemsSolved).dinosaurName
      : null;

    setGameSession({
      activeProblem: nextProblem,
      steps: nextSteps,
      sessionSolvedProblems: currentState.sessionSolvedProblems + 1,
      sessionAttemptedProblems: currentState.sessionAttemptedProblems + 1,
      totalProblemsSolved: nextTotalProblemsSolved,
      totalProblemsAttempted: currentState.totalProblemsAttempted + 1,
      unlockedRewards: nextUnlockedRewards,
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
            className="jurassic-panel motif-track player-start-panel"
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
                {gameSession.totalProblemsSolved}
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
          </div>
        </div>
      </div>
    </main>
  );
}
