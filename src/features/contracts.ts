export type FeatureModuleId =
  | "division-engine"
  | "workspace-ui"
  | "rewards"
  | "gallery"
  | "persistence";

export interface FeatureModuleDescriptor {
  id: FeatureModuleId;
  title: string;
  summary: string;
  rootPath: string;
}

export type IsoDateString = string;

export interface DivisionProblem {
  id: string;
  dividend: number;
  divisor: number;
  allowRemainder: boolean;
  difficultyLevel: number;
}

export type LongDivisionStepKind =
  | "quotient-digit"
  | "multiply-result"
  | "subtraction-result"
  | "bring-down";

export const LONG_DIVISION_STEP_ORDER = [
  "quotient-digit",
  "multiply-result",
  "subtraction-result",
  "bring-down",
] as const satisfies readonly LongDivisionStepKind[];

export interface LongDivisionStep {
  id: string;
  problemId: DivisionProblem["id"];
  kind: LongDivisionStepKind;
  sequenceIndex: number;
  expectedValue: string;
  inputTargetId: string | null;
}

export type ActiveInputLane = "quotient" | "multiply" | "subtract" | "bring-down";

export interface ActiveInputTarget {
  id: string;
  problemId: DivisionProblem["id"];
  stepId: LongDivisionStep["id"];
  lane: ActiveInputLane;
  rowIndex: number;
  columnIndex: number;
}

export interface PlayerSessionProgress {
  sessionId: string;
  startedAt: IsoDateString;
  solvedProblems: number;
  attemptedProblems: number;
}

export interface PlayerLifetimeProgress {
  totalProblemsSolved: number;
  totalProblemsAttempted: number;
  currentDifficultyLevel: number;
  rewardsUnlocked: number;
}

export interface PlayerProgressState {
  session: PlayerSessionProgress;
  lifetime: PlayerLifetimeProgress;
}

export interface UnlockedReward {
  rewardId: string;
  dinosaurName: string;
  imagePath: string;
  earnedAt: IsoDateString;
  milestoneSolvedCount: number;
}

export interface SessionHistoryEntry {
  sessionId: string;
  startedAt: IsoDateString;
  endedAt: IsoDateString | null;
  solvedProblems: number;
  attemptedProblems: number;
}

export const SAVE_FILE_SCHEMA_VERSION = 1;

export interface DinoDivisionSaveFile {
  schemaVersion: typeof SAVE_FILE_SCHEMA_VERSION;
  playerName: string;
  totalProblemsSolved: number;
  currentDifficultyLevel: number;
  progress: PlayerProgressState;
  unlockedDinosaurs: UnlockedReward[];
  sessionHistory: SessionHistoryEntry[];
  updatedAt: IsoDateString;
}

export interface DivisionGameState {
  activeProblem: DivisionProblem | null;
  steps: LongDivisionStep[];
  activeInputTarget: ActiveInputTarget | null;
  progress: PlayerProgressState;
  unlockedRewards: UnlockedReward[];
}
