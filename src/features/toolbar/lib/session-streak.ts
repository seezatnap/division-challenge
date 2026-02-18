export type SessionValidationOutcome = "correct" | "incorrect" | "complete";

export interface SessionSolvedProgress {
  readonly sessionSolvedProblems: number;
  readonly currentStreak: number;
}

function toNonNegativeInteger(value: number): number {
  if (!Number.isInteger(value) || !Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, value);
}

export function resolveCurrentStreakAfterValidationOutcome(input: {
  currentStreak: number;
  outcome: SessionValidationOutcome;
}): number {
  const normalizedCurrentStreak = toNonNegativeInteger(input.currentStreak);
  if (input.outcome === "incorrect") {
    return 0;
  }

  return normalizedCurrentStreak;
}

export function resolveSolvedProgressAfterCompletedProblem(
  progress: SessionSolvedProgress,
): SessionSolvedProgress {
  return {
    sessionSolvedProblems: toNonNegativeInteger(progress.sessionSolvedProblems) + 1,
    currentStreak: toNonNegativeInteger(progress.currentStreak) + 1,
  };
}
