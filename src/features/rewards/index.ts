/**
 * Rewards
 *
 * Responsible for:
 * - Gemini image generation endpoints/services
 * - Filesystem image caching and dedup
 * - Reward milestone logic (every 5 solved)
 * - Near-milestone prefetch triggers
 * - Egg-hatching loading UX and reveal
 * - Dinosaur roster & deterministic unlock order
 */
export { getGeminiConfig, GEMINI_MODEL } from "./gemini-config";
export type { GeminiConfig } from "./gemini-config";
export { buildDinoPrompt } from "./prompt-builder";
export type { DinoPromptOptions } from "./prompt-builder";
export {
  DINOSAUR_ROSTER,
  TOTAL_DINOSAURS,
  PROBLEMS_PER_MILESTONE,
  getDinosaurForMilestone,
  getMilestoneForDinosaur,
  milestoneFromProblemsSolved,
  getDinosaurForProblemsSolved,
  isRewardMilestone,
  getNextMilestone,
  getAllDinosaurNames,
  getPriorityDinosaurNames,
  getNonPriorityDinosaurNames,
} from "./dinosaurs";
export type { DinosaurEntry } from "./dinosaurs";

export {
  RewardGenerationStatus,
  type UnlockedReward,
  type RewardGenerationState,
} from "@/types";
