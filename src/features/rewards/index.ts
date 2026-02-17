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
  generateDinoImage,
  parseImageFromResponse,
  imageToBuffer,
  extensionForMimeType,
  GeminiResponseParseError,
  GeminiApiError,
} from "./gemini-image-service";
export type {
  GeneratedImage,
  ImageGenerationResult,
  ImageGenerationError,
  ImageGenerationOutcome,
} from "./gemini-image-service";
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
  dinoSlug,
  getDinoImageDir,
  ensureDinoImageDir,
  findCachedImage,
  saveDinoImage,
  generateDinoImageCached,
} from "./dino-image-cache";
export type {
  CachedImageHit,
  CachedImageMiss,
  CacheCheckResult,
  SavedImageInfo,
  CachedGenerationResult,
  CachedGenerationError,
  CachedGenerationOutcome,
} from "./dino-image-cache";

export {
  RewardGenerationStatus,
  type UnlockedReward,
  type RewardGenerationState,
} from "@/types";
