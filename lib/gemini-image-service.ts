import {
  GoogleGenerativeAI,
  type GenerateContentRequest,
  type GenerationConfig,
  type Part,
} from "@google/generative-ai";

import { getGeminiApiKey } from "./env";

export const GEMINI_IMAGE_MODEL = "gemini-2.0-flash-exp";

const IMAGE_RESPONSE_MODALITIES = ["IMAGE", "TEXT"] as const;

interface ImageGenerationConfig extends GenerationConfig {
  responseModalities?: readonly string[];
}

export interface GeminiGeneratedImage {
  dinosaurName: string;
  model: string;
  prompt: string;
  mimeType: string;
  data: string;
}

export interface GenerativeModelLike {
  generateContent(
    request: GenerateContentRequest | string | Array<string | Part>,
  ): Promise<GeminiGenerateContentResult>;
}

interface GeminiInlineData {
  mimeType?: string;
  data?: string;
}

interface GeminiResponsePart {
  inlineData?: GeminiInlineData;
  text?: string;
}

interface GeminiResponseCandidate {
  content?: {
    parts?: GeminiResponsePart[];
  };
}

interface GeminiGenerateContentResult {
  response: {
    candidates?: GeminiResponseCandidate[];
  };
}

export interface GenerateGeminiDinosaurImageOptions {
  dinosaurName: string;
  model?: string;
  apiKey?: string;
  modelClient?: GenerativeModelLike;
  createModelClient?: (apiKey: string, model: string) => GenerativeModelLike;
}

function normalizeDinosaurName(name: string): string {
  const trimmedName = name.trim();

  if (!trimmedName) {
    throw new Error("Dinosaur name is required for Gemini image generation.");
  }

  return trimmedName;
}

function createGeminiModelClient(
  apiKey: string,
  model: string,
): GenerativeModelLike {
  const genAi = new GoogleGenerativeAI(apiKey);
  return genAi.getGenerativeModel({ model });
}

function createImageGenerationRequest(prompt: string): GenerateContentRequest {
  const generationConfig: ImageGenerationConfig = {
    responseModalities: IMAGE_RESPONSE_MODALITIES,
  };

  return {
    contents: [
      {
        role: "user",
        parts: [{ text: prompt }],
      },
    ],
    generationConfig,
  };
}

function extractInlineImage(result: GeminiGenerateContentResult): {
  mimeType: string;
  data: string;
} {
  const candidates = result.response.candidates ?? [];

  for (const candidate of candidates) {
    const parts = candidate.content?.parts ?? [];

    for (const part of parts) {
      if (!("inlineData" in part) || !part.inlineData) {
        continue;
      }

      const mimeType = part.inlineData.mimeType;
      const data = part.inlineData.data;

      if (
        typeof mimeType === "string" &&
        mimeType.startsWith("image/") &&
        typeof data === "string" &&
        data.trim().length > 0
      ) {
        return {
          mimeType,
          data,
        };
      }
    }
  }

  throw new Error("Gemini did not return an inline image payload.");
}

export function buildJurassicParkImagePrompt(dinosaurName: string): string {
  const normalizedName = normalizeDinosaurName(dinosaurName);

  return [
    `Create a cinematic, photorealistic image of a ${normalizedName}.`,
    "Style it like a Jurassic Park and Jurassic World movie still.",
    "Use dramatic jungle atmosphere, natural prehistoric detail, and realistic lighting.",
    "No text, no watermark, no logo, no frame.",
    "Single dinosaur subject in sharp focus.",
  ].join(" ");
}

export async function generateGeminiDinosaurImage(
  options: GenerateGeminiDinosaurImageOptions,
): Promise<GeminiGeneratedImage> {
  const dinosaurName = normalizeDinosaurName(options.dinosaurName);
  const model = options.model ?? GEMINI_IMAGE_MODEL;
  const prompt = buildJurassicParkImagePrompt(dinosaurName);

  const modelClient = options.modelClient ??
    (options.createModelClient ?? createGeminiModelClient)(
      options.apiKey ?? getGeminiApiKey(),
      model,
    );

  const result = await modelClient.generateContent(
    createImageGenerationRequest(prompt),
  );
  const image = extractInlineImage(result);

  return {
    dinosaurName,
    model,
    prompt,
    mimeType: image.mimeType,
    data: image.data,
  };
}
