/**
 * Rewards
 *
 * Responsible for:
 * - Gemini image generation endpoints/services
 * - Filesystem image caching and dedup
 * - Reward milestone logic (every 5 solved)
 * - Near-milestone prefetch triggers
 * - Egg-hatching loading UX and reveal
 */
export { getGeminiConfig, GEMINI_MODEL } from "./gemini-config";
export type { GeminiConfig } from "./gemini-config";
export { buildDinoPrompt } from "./prompt-builder";
export type { DinoPromptOptions } from "./prompt-builder";
