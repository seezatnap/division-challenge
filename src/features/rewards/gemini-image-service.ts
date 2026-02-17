/**
 * Gemini Image Generation Service
 *
 * Server-side service that uses the @google/generative-ai SDK and
 * gemini-2.0-flash-exp to generate dinosaur images.
 * Includes robust response parsing and error handling.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { getGeminiConfig } from "./gemini-config";
import { buildDinoPrompt } from "./prompt-builder";
import type { DinoPromptOptions } from "./prompt-builder";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of a successful image generation. */
export interface GeneratedImage {
  /** Base64-encoded image data. */
  base64Data: string;
  /** MIME type of the image (e.g. "image/png"). */
  mimeType: string;
}

/** Result wrapper returned by the generation service. */
export interface ImageGenerationResult {
  success: true;
  image: GeneratedImage;
}

/** Error wrapper returned by the generation service. */
export interface ImageGenerationError {
  success: false;
  error: string;
}

export type ImageGenerationOutcome =
  | ImageGenerationResult
  | ImageGenerationError;

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

/** Thrown when Gemini returns a response that cannot be parsed into an image. */
export class GeminiResponseParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GeminiResponseParseError";
  }
}

/** Thrown when the Gemini API returns an error or the request fails. */
export class GeminiApiError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "GeminiApiError";
  }
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Extracts the first inline image from a Gemini generateContent response.
 *
 * The gemini-2.0-flash-exp model returns images as parts with `inlineData`
 * containing base64-encoded data and a mimeType.
 *
 * Accepts `unknown` and validates structurally so it works with any version
 * of the SDK's GenerateContentResult type as well as plain objects in tests.
 *
 * @param response - The raw response object from generateContent()
 * @returns The extracted image data
 * @throws {GeminiResponseParseError} if no image data can be found
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseImageFromResponse(response: any): GeneratedImage {
  const candidates = response?.response?.candidates;

  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new GeminiResponseParseError(
      "Gemini response contains no candidates.",
    );
  }

  const parts = candidates[0]?.content?.parts;

  if (!Array.isArray(parts) || parts.length === 0) {
    throw new GeminiResponseParseError(
      "Gemini response candidate contains no parts.",
    );
  }

  // Find the first part with inlineData (image)
  for (const part of parts) {
    const inlineData = part?.inlineData as
      | { data: string; mimeType: string }
      | undefined;

    if (
      inlineData &&
      typeof inlineData.data === "string" &&
      inlineData.data.length > 0 &&
      typeof inlineData.mimeType === "string"
    ) {
      return {
        base64Data: inlineData.data,
        mimeType: inlineData.mimeType,
      };
    }
  }

  throw new GeminiResponseParseError(
    "Gemini response contains no inline image data.",
  );
}

// ---------------------------------------------------------------------------
// Main generation function
// ---------------------------------------------------------------------------

/**
 * Generates a dinosaur image via Gemini's gemini-2.0-flash-exp model.
 *
 * Uses the configured API key and the Jurassic Park cinematic prompt builder.
 * Returns a result-or-error discriminated union so callers can handle
 * failures gracefully without try/catch.
 *
 * @param options - Dinosaur name and optional scene hint
 * @returns An outcome object with either the generated image or an error message
 */
export async function generateDinoImage(
  options: DinoPromptOptions,
): Promise<ImageGenerationOutcome> {
  try {
    const config = getGeminiConfig();
    const prompt = buildDinoPrompt(options);

    const genAI = new GoogleGenerativeAI(config.apiKey);
    const model = genAI.getGenerativeModel({
      model: config.model,
      generationConfig: {
        // gemini-2.0-flash-exp supports image output via responseModalities.
        // The SDK types at v0.24.x don't include this field yet, so we
        // pass it through the config object.
        responseModalities: ["TEXT", "IMAGE"],
      } as Record<string, unknown>,
    });

    const result = await model.generateContent(prompt);

    const image = parseImageFromResponse(result);

    return { success: true, image };
  } catch (error: unknown) {
    if (
      error instanceof GeminiResponseParseError ||
      error instanceof GeminiApiError
    ) {
      return { success: false, error: error.message };
    }

    // Wrap unexpected errors
    const message =
      error instanceof Error
        ? error.message
        : "Unknown error during image generation";

    return { success: false, error: message };
  }
}

/**
 * Converts a GeneratedImage to a Buffer suitable for writing to the filesystem.
 *
 * @param image - The generated image with base64 data
 * @returns A Buffer containing the raw image bytes
 */
export function imageToBuffer(image: GeneratedImage): Buffer {
  return Buffer.from(image.base64Data, "base64");
}

/**
 * Returns the file extension for a given MIME type.
 *
 * @param mimeType - e.g. "image/png", "image/jpeg"
 * @returns The extension without dot, e.g. "png", "jpg"
 */
export function extensionForMimeType(mimeType: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
  };

  return map[mimeType] ?? "png";
}
