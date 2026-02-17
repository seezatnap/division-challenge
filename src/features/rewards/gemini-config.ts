/**
 * Gemini API configuration.
 *
 * Reads GEMINI_API_KEY from the environment (set via .env.local for Next.js)
 * and exposes typed config for the gemini-2.0-flash-exp model.
 */

export const GEMINI_MODEL = "gemini-2.0-flash-exp" as const;

export interface GeminiConfig {
  apiKey: string;
  model: typeof GEMINI_MODEL;
}

/**
 * Returns a validated Gemini configuration object.
 *
 * Reads `GEMINI_API_KEY` from `process.env`. In Next.js this value is
 * available server-side when defined in `.env.local`.
 *
 * @throws {Error} if the key is missing or empty.
 */
export function getGeminiConfig(): GeminiConfig {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local to enable dinosaur image generation.",
    );
  }

  return {
    apiKey: apiKey.trim(),
    model: GEMINI_MODEL,
  };
}
