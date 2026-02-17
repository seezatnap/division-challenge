export const GEMINI_API_KEY_ENV_VAR = "GEMINI_API_KEY";
export const GEMINI_IMAGE_MODEL = "gemini-2.0-flash-exp";

const GEMINI_API_KEY_ERROR =
  "Missing GEMINI_API_KEY. Set GEMINI_API_KEY in .env.local before requesting Gemini rewards.";

export interface GeminiImageRequestConfig {
  readonly apiKey: string;
  readonly model: typeof GEMINI_IMAGE_MODEL;
}

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

export function getGeminiApiKey(env: RuntimeEnvironment = process.env): string {
  const apiKey = env[GEMINI_API_KEY_ENV_VAR];

  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new Error(GEMINI_API_KEY_ERROR);
  }

  return apiKey.trim();
}

export function createGeminiImageRequestConfig(
  env: RuntimeEnvironment = process.env,
): GeminiImageRequestConfig {
  return {
    apiKey: getGeminiApiKey(env),
    model: GEMINI_IMAGE_MODEL,
  };
}

export function buildJurassicParkCinematicPrompt(dinosaurName: string): string {
  const sanitizedName = dinosaurName.trim();

  if (sanitizedName.length === 0) {
    throw new Error("dinosaurName must be a non-empty string.");
  }

  return [
    `Create a photorealistic cinematic still of a ${sanitizedName} in a Jurassic Park inspired scene.`,
    "Frame the dinosaur as the hero subject with accurate anatomy and rich skin detail.",
    "Use dramatic scale, dense tropical foliage, humid mist, and golden-hour rim lighting.",
    "Style the image like practical-effects era adventure cinema with subtle 35mm film texture.",
    "Keep the tone family-friendly and awe-filled, with no gore or graphic violence.",
  ].join(" ");
}
