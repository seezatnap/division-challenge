/**
 * Division Engine
 *
 * Responsible for:
 * - Problem generation with difficulty tiers
 * - Long-division solver (step-by-step workflow)
 * - Step validation and retry logic
 * - Difficulty progression rules
 */

export {
  DifficultyLevel,
  StepKind,
  type DivisionProblem,
  type QuotientDigitStep,
  type MultiplyStep,
  type SubtractStep,
  type BringDownStep,
  type DivisionStep,
  type DivisionSolution,
} from "@/types";

export {
  generateProblem,
  generateProblemForPlayer,
  type GenerateProblemOptions,
  type GenerateForPlayerOptions,
} from "./problem-generator";

export {
  getDifficultyForSolvedCount,
  getCurrentDifficulty,
  problemsUntilNextTier,
  getNextDifficultyLevel,
  getAllDifficultyLevels,
  DIFFICULTY_THRESHOLDS,
  type DifficultyThreshold,
} from "./difficulty-progression";

export { solveDivisionProblem } from "./solver";
