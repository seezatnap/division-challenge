export type FeatureModuleId =
  | "division-engine"
  | "multiplication-engine"
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

export type GameMode = "division" | "multiplication";

export interface DivisionProblem {
  id: string;
  dividend: number;
  divisor: number;
  allowRemainder: boolean;
  difficultyLevel: number;
}

export interface MultiplicationProblem {
  id: string;
  /** Digit string of the top factor as an integer, e.g. 8.84 is stored as 884. */
  multiplicand: number;
  /** Digit string of the bottom factor as an integer, e.g. 8.6 is stored as 86. */
  multiplier: number;
  /** Decimal places in the top factor (0 or omitted for whole numbers). */
  multiplicandDecimalPlaces?: number;
  /** Decimal places in the bottom factor (0 or omitted for whole numbers). */
  multiplierDecimalPlaces?: number;
  difficultyLevel: number;
}

export type LongDivisionStepKind =
  | "quotient-digit"
  | "multiply-result"
  | "subtraction-result"
  | "bring-down";

export type LongMultiplicationStepKind = "partial-product" | "product-sum" | "decimal-point";

export type WorkspaceStepKind = LongDivisionStepKind | LongMultiplicationStepKind;

export const LONG_DIVISION_STEP_ORDER = [
  "quotient-digit",
  "multiply-result",
  "subtraction-result",
  "bring-down",
] as const satisfies readonly LongDivisionStepKind[];

export const LONG_MULTIPLICATION_STEP_ORDER = [
  "partial-product",
  "product-sum",
  "decimal-point",
] as const satisfies readonly LongMultiplicationStepKind[];

export interface WorkspaceStep {
  id: string;
  problemId: string;
  kind: WorkspaceStepKind;
  sequenceIndex: number;
  expectedValue: string;
  inputTargetId: string | null;
}

export interface LongDivisionStep extends WorkspaceStep {
  problemId: DivisionProblem["id"];
  kind: LongDivisionStepKind;
}

export interface LongMultiplicationStep extends WorkspaceStep {
  problemId: MultiplicationProblem["id"];
  kind: LongMultiplicationStepKind;
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

export interface UnlockedHybridReward {
  hybridId: string;
  hybridName: string;
  pairKey: string;
  firstDinosaurName: string;
  secondDinosaurName: string;
  generationAssetName: string;
  imagePath: string;
  createdAt: IsoDateString;
}

export interface DivisionGameState {
  activeProblem: DivisionProblem | null;
  steps: LongDivisionStep[];
  activeInputTarget: ActiveInputTarget | null;
  progress: PlayerProgressState;
  unlockedRewards: UnlockedReward[];
  unlockedHybrids?: UnlockedHybridReward[];
}
