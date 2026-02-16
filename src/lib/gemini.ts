/**
 * Server-side Gemini image generation service.
 * Uses @google/generative-ai with gemini-2.0-flash-exp to generate
 * Jurassic Park cinematic-style dinosaur images.
 */

import { GoogleGenerativeAI, GenerationConfig } from "@google/generative-ai";
import { getGeminiApiKey } from "./env";

const MODEL_NAME = "gemini-2.0-flash-exp";

/**
 * Build a cinematic Jurassic Park-style image prompt for the given dinosaur.
 */
export function buildDinoPrompt(dinoName: string): string {
  return (
    `Generate a photorealistic image of a ${dinoName} in the style of ` +
    `Jurassic Park. The dinosaur should be depicted in a lush, tropical ` +
    `jungle environment with dramatic cinematic lighting, volumetric fog, ` +
    `and a sense of awe and scale. The scene should evoke the visual tone ` +
    `of Steven Spielberg's Jurassic Park films — golden hour light ` +
    `filtering through dense foliage, the dinosaur in a powerful or ` +
    `majestic pose. High detail, cinematic composition, 4K quality.`
  );
}

/** The result of a successful image generation. */
export interface GeneratedImage {
  /** Base64-encoded PNG image data. */
  base64Data: string;
  /** The MIME type of the image (e.g. "image/png"). */
  mimeType: string;
}

/**
 * Call Gemini to generate a dinosaur image.
 *
 * @param dinoName - The name of the dinosaur to depict.
 * @returns The generated image as base64 data with its MIME type.
 * @throws If the API call fails or returns no image data.
 */
export async function generateDinoImage(
  dinoName: string,
): Promise<GeneratedImage> {
  const apiKey = getGeminiApiKey();
  const genAI = new GoogleGenerativeAI(apiKey);

  // responseModalities is supported by the API but not yet typed in
  // @google/generative-ai v0.24. We pass it via a type assertion.
  const generationConfig: GenerationConfig & {
    responseModalities: string[];
  } = {
    responseModalities: ["Text", "Image"],
  };

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: generationConfig as GenerationConfig,
  });

  const prompt = buildDinoPrompt(dinoName);
  const result = await model.generateContent(prompt);
  const response = result.response;
  const candidates = response.candidates;

  if (!candidates || candidates.length === 0) {
    throw new Error("Gemini returned no candidates for image generation.");
  }

  const parts = candidates[0].content.parts;

  for (const part of parts) {
    // inlineData contains the generated image as base64
    if (part.inlineData) {
      return {
        base64Data: part.inlineData.data,
        mimeType: part.inlineData.mimeType,
      };
    }
  }

  throw new Error(
    "Gemini response did not contain image data. " +
      "The model may not support image generation with the current configuration.",
  );
}
