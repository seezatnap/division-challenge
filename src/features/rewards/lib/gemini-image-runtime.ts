import { GoogleGenAI } from "@google/genai";

import {
  buildJurassicParkCinematicPrompt,
  createGeminiImageRequestConfig,
} from "./gemini";
import {
  generateGeminiDinosaurImage,
  type GeminiGeneratedImage,
  type GeminiImageServiceDependencies,
} from "./gemini-image-service";

const defaultGeminiImageServiceDependencies: GeminiImageServiceDependencies = {
  getRequestConfig: createGeminiImageRequestConfig,
  buildPrompt: buildJurassicParkCinematicPrompt,
  createClient: (apiKey: string) => new GoogleGenAI({ apiKey }),
};

export function generateGeminiRewardImage(
  payload: unknown,
  dependencies: GeminiImageServiceDependencies = defaultGeminiImageServiceDependencies,
): Promise<GeminiGeneratedImage> {
  return generateGeminiDinosaurImage(payload, dependencies);
}
