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

export { generateProblem, type GenerateProblemOptions } from "./problem-generator";
