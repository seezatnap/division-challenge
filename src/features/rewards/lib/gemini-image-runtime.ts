import { GoogleGenAI } from "@google/genai";

import {
  buildJurassicParkCinematicPrompt,
  createGeminiImageRequestConfig,
} from "./gemini";
import { resolveGeminiRewardImageWithFilesystemCache } from "./gemini-image-cache";
import {
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

export async function generateGeminiRewardImage(
  payload: unknown,
  dependencies: GeminiImageServiceDependencies = defaultGeminiImageServiceDependencies,
): Promise<GeminiGeneratedImage> {
  const request = parseGeminiImageGenerationRequest(payload);

  return resolveGeminiRewardImageWithFilesystemCache(
    request,
    (parsedRequest) => generateGeminiDinosaurImage(parsedRequest, dependencies),
  );
}
