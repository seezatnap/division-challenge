import type {
  ActiveInputLane,
  ActiveInputTarget,
  DivisionGameState,
  DivisionProblem,
  LongDivisionStep,
  PlayerProgressState,
  UnlockedReward,
} from "@/features/contracts";
import type { LongDivisionSolution } from "@/features/division-engine/lib/long-division-solver";
import type {
  DivisionProblemRemainderMode,
  LifetimeAwareDivisionProblemGenerationOptions,
} from "@/features/division-engine/lib/problem-generator";
import type {
  LongDivisionStepValidationRequest,
  LongDivisionStepValidationResult,
} from "@/features/division-engine/lib/step-validation";
import type {
  RewardMilestoneResolutionRequest,
  RewardMilestoneResolutionResult,
} from "@/features/rewards/lib/milestones";

const DEFAULT_REMAINDER_MODE: DivisionProblemRemainderMode = "allow";

const STEP_KIND_TO_INPUT_LANE: Record<LongDivisionStep["kind"], ActiveInputLane> = {
  "quotient-digit": "quotient",
  "multiply-result": "multiply",
  "subtraction-result": "subtract",
  "bring-down": "bring-down",
};

function assertNonNegativeInteger(value: number, argumentName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${argumentName} must be a non-negative integer.`);
  }
}

function assertProgressState(progress: PlayerProgressState): void {
  assertNonNegativeInteger(progress.session.solvedProblems, "progress.session.solvedProblems");
  assertNonNegativeInteger(progress.session.attemptedProblems, "progress.session.attemptedProblems");
  assertNonNegativeInteger(progress.lifetime.totalProblemsSolved, "progress.lifetime.totalProblemsSolved");
  assertNonNegativeInteger(
    progress.lifetime.totalProblemsAttempted,
    "progress.lifetime.totalProblemsAttempted",
  );
  assertNonNegativeInteger(progress.lifetime.rewardsUnlocked, "progress.lifetime.rewardsUnlocked");

  if (progress.session.attemptedProblems < progress.session.solvedProblems) {
    throw new Error("progress.session.attemptedProblems cannot be less than solvedProblems.");
  }

  if (progress.lifetime.totalProblemsAttempted < progress.lifetime.totalProblemsSolved) {
    throw new Error("progress.lifetime.totalProblemsAttempted cannot be less than totalProblemsSolved.");
  }
}

function cloneProgress(progress: PlayerProgressState): PlayerProgressState {
  return {
    session: { ...progress.session },
    lifetime: { ...progress.lifetime },
  };
}

function cloneUnlockedRewards(unlockedRewards: readonly UnlockedReward[]): UnlockedReward[] {
  return unlockedRewards.map((reward) => ({ ...reward }));
}

function cloneSteps(steps: readonly LongDivisionStep[]): LongDivisionStep[] {
  return steps.map((step) => ({ ...step }));
}

function cloneActiveProblem(problem: DivisionProblem | null): DivisionProblem | null {
  return problem ? { ...problem } : null;
}

function buildActiveInputTarget(step: LongDivisionStep, rowIndex: number, columnIndex: number): ActiveInputTarget {
  return {
    id: step.inputTargetId ?? `${step.id}:target`,
    problemId: step.problemId,
    stepId: step.id,
    lane: STEP_KIND_TO_INPUT_LANE[step.kind],
    rowIndex,
    columnIndex,
  };
}

function resolveActiveInputTargets(steps: readonly LongDivisionStep[]): ActiveInputTarget[] {
  const targets: ActiveInputTarget[] = [];
  let quotientColumnIndex = 0;
  let activeColumnIndex = 0;
  let workRowIndex = 0;

  for (const step of steps) {
    if (step.kind === "quotient-digit") {
      activeColumnIndex = quotientColumnIndex;
      targets.push(buildActiveInputTarget(step, 0, activeColumnIndex));
      quotientColumnIndex += 1;
      continue;
    }

    targets.push(buildActiveInputTarget(step, workRowIndex, activeColumnIndex));
    workRowIndex += 1;
  }

  return targets;
}

function resolveActiveInputTarget(
  steps: readonly LongDivisionStep[],
  activeStepIndex: number | null,
): ActiveInputTarget | null {
  if (activeStepIndex === null) {
    return null;
  }

  if (activeStepIndex < 0 || activeStepIndex >= steps.length) {
    throw new RangeError("activeStepIndex must reference an existing step.");
  }

  const targets = resolveActiveInputTargets(steps);
  return targets[activeStepIndex] ?? null;
}

function resolveStateCopy(state: DivisionGameState): DivisionGameState {
  return {
    activeProblem: cloneActiveProblem(state.activeProblem),
    steps: cloneSteps(state.steps),
    activeInputTarget: state.activeInputTarget ? { ...state.activeInputTarget } : null,
    progress: cloneProgress(state.progress),
    unlockedRewards: cloneUnlockedRewards(state.unlockedRewards),
  };
}

function resolveActiveStepIndexFromTarget(
  steps: readonly LongDivisionStep[],
  activeInputTarget: ActiveInputTarget | null,
): number | null {
  if (!activeInputTarget) {
    return null;
  }

  const stepIndex = steps.findIndex((step) => step.id === activeInputTarget.stepId);
  if (stepIndex < 0) {
    throw new Error("activeInputTarget.stepId must reference one of the active steps.");
  }

  return stepIndex;
}

export interface DivisionGameLoopState extends DivisionGameState {
  activeStepIndex: number | null;
  revealedStepCount: number;
}

export interface DivisionGameLoopDependencies {
  generateDivisionProblemForSolvedCount(
    options: LifetimeAwareDivisionProblemGenerationOptions,
  ): DivisionProblem;
  getDifficultyLevelForSolvedCount(totalProblemsSolved: number): number;
  solveLongDivision(problem: DivisionProblem): LongDivisionSolution;
  validateLongDivisionStepAnswer(
    request: LongDivisionStepValidationRequest,
  ): LongDivisionStepValidationResult;
  resolveRewardMilestones(
    request: RewardMilestoneResolutionRequest,
  ): RewardMilestoneResolutionResult;
}

export interface DivisionGameLoopOrchestratorOptions {
  dependencies: DivisionGameLoopDependencies;
  random?: () => number;
  remainderMode?: DivisionProblemRemainderMode;
}

export interface StartNextDivisionProblemResult {
  state: DivisionGameLoopState;
  startedProblem: DivisionProblem;
  startedStepId: LongDivisionStep["id"] | null;
}

export interface DivisionProblemCompletionSummary {
  problemId: DivisionProblem["id"];
  solvedProblemsThisSession: number;
  totalProblemsSolved: number;
}

export interface DivisionLiveStepInputRequest {
  state: DivisionGameState | DivisionGameLoopState;
  submittedValue: string;
}

export interface DivisionLiveStepInputResult {
  state: DivisionGameLoopState;
  validation: LongDivisionStepValidationResult;
  completedProblem: DivisionProblemCompletionSummary | null;
  newlyUnlockedRewards: UnlockedReward[];
  chainedToNextProblem: boolean;
  nextProblem: DivisionProblem | null;
}

export interface DivisionGameLoopOrchestrator {
  initializeState(state: DivisionGameState | DivisionGameLoopState): DivisionGameLoopState;
  startNextProblem(state: DivisionGameState | DivisionGameLoopState): StartNextDivisionProblemResult;
  applyLiveStepInput(request: DivisionLiveStepInputRequest): DivisionLiveStepInputResult;
}

function isDivisionGameLoopState(state: DivisionGameState | DivisionGameLoopState): state is DivisionGameLoopState {
  return (
    "activeStepIndex" in state &&
    typeof state.activeStepIndex !== "undefined" &&
    "revealedStepCount" in state &&
    typeof state.revealedStepCount === "number"
  );
}

function normalizeDivisionGameLoopState(state: DivisionGameState | DivisionGameLoopState): DivisionGameLoopState {
  const stateCopy = resolveStateCopy(state);
  stateCopy.progress.lifetime.rewardsUnlocked = Math.max(
    stateCopy.progress.lifetime.rewardsUnlocked,
    stateCopy.unlockedRewards.length,
  );
  assertProgressState(stateCopy.progress);

  if (!stateCopy.activeProblem) {
    if (stateCopy.steps.length > 0) {
      throw new Error("steps cannot be populated when activeProblem is null.");
    }

    return {
      ...stateCopy,
      activeStepIndex: null,
      revealedStepCount: 0,
    };
  }

  if (stateCopy.steps.length === 0) {
    throw new Error("steps must be populated when activeProblem is present.");
  }

  if (isDivisionGameLoopState(state)) {
    const normalizedRevealedStepCount = Math.min(
      Math.max(state.revealedStepCount, 0),
      stateCopy.steps.length,
    );

    if (state.activeStepIndex === null) {
      return {
        ...stateCopy,
        activeStepIndex: null,
        revealedStepCount: normalizedRevealedStepCount,
        activeInputTarget: null,
      };
    }

    if (!Number.isInteger(state.activeStepIndex)) {
      throw new RangeError("activeStepIndex must be an integer or null.");
    }

    if (state.activeStepIndex < 0 || state.activeStepIndex >= stateCopy.steps.length) {
      throw new RangeError("activeStepIndex must reference an existing step.");
    }

    return {
      ...stateCopy,
      activeStepIndex: state.activeStepIndex,
      revealedStepCount: Math.max(normalizedRevealedStepCount, state.activeStepIndex),
      activeInputTarget: resolveActiveInputTarget(stateCopy.steps, state.activeStepIndex),
    };
  }

  const activeStepIndex = resolveActiveStepIndexFromTarget(stateCopy.steps, stateCopy.activeInputTarget);
  if (activeStepIndex === null) {
    return {
      ...stateCopy,
      activeStepIndex: null,
      revealedStepCount: stateCopy.steps.length,
      activeInputTarget: null,
    };
  }

  return {
    ...stateCopy,
    activeStepIndex,
    revealedStepCount: activeStepIndex,
    activeInputTarget: resolveActiveInputTarget(stateCopy.steps, activeStepIndex),
  };
}

function startNextProblemFromState(
  state: DivisionGameLoopState,
  options: DivisionGameLoopOrchestratorOptions,
): StartNextDivisionProblemResult {
  const { dependencies, random, remainderMode = DEFAULT_REMAINDER_MODE } = options;
  const totalProblemsSolved = state.progress.lifetime.totalProblemsSolved;
  const currentDifficultyLevel = dependencies.getDifficultyLevelForSolvedCount(totalProblemsSolved);
  const startedProblem = dependencies.generateDivisionProblemForSolvedCount({
    totalProblemsSolved,
    random,
    remainderMode,
  });
  const solution = dependencies.solveLongDivision(startedProblem);

  if (!Array.isArray(solution.steps) || solution.steps.length === 0) {
    throw new Error("solveLongDivision must return at least one step.");
  }

  const startedSteps = cloneSteps(solution.steps);
  const startedState: DivisionGameLoopState = {
    ...state,
    activeProblem: { ...startedProblem },
    steps: startedSteps,
    activeStepIndex: 0,
    revealedStepCount: 0,
    activeInputTarget: resolveActiveInputTarget(startedSteps, 0),
    progress: {
      session: {
        ...state.progress.session,
        attemptedProblems: state.progress.session.attemptedProblems + 1,
      },
      lifetime: {
        ...state.progress.lifetime,
        totalProblemsAttempted: state.progress.lifetime.totalProblemsAttempted + 1,
        currentDifficultyLevel,
      },
    },
  };

  return {
    state: startedState,
    startedProblem,
    startedStepId: startedSteps[0]?.id ?? null,
  };
}

export function createDivisionGameLoopOrchestrator(
  options: DivisionGameLoopOrchestratorOptions,
): DivisionGameLoopOrchestrator {
  const { dependencies } = options;

  return {
    initializeState(state) {
      return normalizeDivisionGameLoopState(state);
    },

    startNextProblem(state) {
      const normalizedState = normalizeDivisionGameLoopState(state);
      return startNextProblemFromState(normalizedState, options);
    },

    applyLiveStepInput(request) {
      const normalizedState = normalizeDivisionGameLoopState(request.state);

      if (!normalizedState.activeProblem) {
        throw new Error("An active problem is required before step input can be applied.");
      }

      if (normalizedState.activeStepIndex === null) {
        throw new Error("activeStepIndex must reference a step before step input can be applied.");
      }

      const validation = dependencies.validateLongDivisionStepAnswer({
        steps: normalizedState.steps,
        currentStepIndex: normalizedState.activeStepIndex,
        submittedValue: request.submittedValue,
      });

      if (!validation.didAdvance) {
        return {
          state: normalizedState,
          validation,
          completedProblem: null,
          newlyUnlockedRewards: [],
          chainedToNextProblem: false,
          nextProblem: null,
        };
      }

      if (!validation.isProblemComplete) {
        if (validation.focusStepIndex === null) {
          throw new Error("focusStepIndex must be set when the problem is not complete.");
        }

        const nextActiveInputTarget = resolveActiveInputTarget(
          normalizedState.steps,
          validation.focusStepIndex,
        );

        return {
          state: {
            ...normalizedState,
            activeStepIndex: validation.focusStepIndex,
            revealedStepCount: Math.max(
              normalizedState.revealedStepCount,
              normalizedState.activeStepIndex + 1,
            ),
            activeInputTarget: nextActiveInputTarget,
          },
          validation,
          completedProblem: null,
          newlyUnlockedRewards: [],
          chainedToNextProblem: false,
          nextProblem: null,
        };
      }

      const completedProblemId = normalizedState.activeProblem.id;
      const completedProgress: PlayerProgressState = {
        session: {
          ...normalizedState.progress.session,
          solvedProblems: normalizedState.progress.session.solvedProblems + 1,
        },
        lifetime: {
          ...normalizedState.progress.lifetime,
          totalProblemsSolved: normalizedState.progress.lifetime.totalProblemsSolved + 1,
          currentDifficultyLevel: dependencies.getDifficultyLevelForSolvedCount(
            normalizedState.progress.lifetime.totalProblemsSolved + 1,
          ),
        },
      };

      const rewardMilestoneResolution = dependencies.resolveRewardMilestones({
        totalProblemsSolved: completedProgress.lifetime.totalProblemsSolved,
        unlockedRewards: normalizedState.unlockedRewards,
      });
      const unlockedRewards = cloneUnlockedRewards(rewardMilestoneResolution.unlockedRewards);
      const newlyUnlockedRewards = cloneUnlockedRewards(
        rewardMilestoneResolution.newlyUnlockedRewards,
      );

      const completionSummary: DivisionProblemCompletionSummary = {
        problemId: completedProblemId,
        solvedProblemsThisSession: completedProgress.session.solvedProblems,
        totalProblemsSolved: completedProgress.lifetime.totalProblemsSolved,
      };

      const completedState: DivisionGameLoopState = {
        ...normalizedState,
        activeStepIndex: null,
        revealedStepCount: normalizedState.steps.length,
        activeInputTarget: null,
        progress: {
          ...completedProgress,
          lifetime: {
            ...completedProgress.lifetime,
            rewardsUnlocked: unlockedRewards.length,
          },
        },
        unlockedRewards,
      };

      const chainedResult = startNextProblemFromState(completedState, options);

      return {
        state: chainedResult.state,
        validation,
        completedProblem: completionSummary,
        newlyUnlockedRewards,
        chainedToNextProblem: true,
        nextProblem: chainedResult.startedProblem,
      };
    },
  };
}
