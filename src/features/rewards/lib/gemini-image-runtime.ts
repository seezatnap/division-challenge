import { GoogleGenAI } from "@google/genai";

import {
  buildJurassicParkCinematicPrompt,
  createGeminiImageRequestConfig,
} from "./gemini";
import { createFallbackRewardImage } from "./fallback-reward-image";
import { resolveGeminiRewardImageWithFilesystemCache } from "./gemini-image-cache";
import {
  GeminiImageGenerationError,
  generateGeminiDinosaurImage,
  parseGeminiImageGenerationRequest,
  type GeminiGeneratedImage,
  type GeminiImageServiceDependencies,
} from "./gemini-image-service";

const defaultGeminiImageServiceDependencies: GeminiImageServiceDependencies = {
  getRequestConfig: createGeminiImageRequestConfig,
  buildPrompt: buildJurassicParkCinematicPrompt,
  createClient: (apiKey: string) => new GoogleGenAI({ apiKey }),
};

function shouldUseFallbackRewardImage(error: unknown): boolean {
  if (!(error instanceof GeminiImageGenerationError)) {
    return false;
  }

  return (
    error.code === "GEMINI_CONFIG_ERROR" ||
    error.code === "GEMINI_PROMPT_ERROR" ||
    error.code === "GEMINI_REQUEST_FAILED" ||
    error.code === "GEMINI_RESPONSE_INVALID" ||
    error.code === "GEMINI_IMAGE_MISSING" ||
    error.code === "GEMINI_IMAGE_DATA_INVALID"
  );
}

export async function generateGeminiRewardImage(
  payload: unknown,
  dependencies: GeminiImageServiceDependencies = defaultGeminiImageServiceDependencies,
): Promise<GeminiGeneratedImage> {
  const request = parseGeminiImageGenerationRequest(payload);

  return resolveGeminiRewardImageWithFilesystemCache(
    request,
    async (parsedRequest) => {
      try {
        return await generateGeminiDinosaurImage(parsedRequest, dependencies);
      } catch (error) {
        if (!shouldUseFallbackRewardImage(error)) {
          throw error;
        }

        return createFallbackRewardImage(parsedRequest.dinosaurName);
      }
    },
  );
}
