export const GEMINI_API_KEY_ENV_VAR = "GEMINI_API_KEY";
export const GEMINI_IMAGE_MODEL_ENV_VAR = "GEMINI_IMAGE_MODEL";
export const GEMINI_IMAGE_MODEL_DEFAULT = "gemini-2.5-flash-image-preview";
export const NANO_BANANA_PRO_IMAGE_MODEL = "gemini-3-pro-image-preview";

const GEMINI_API_KEY_ERROR =
  "Missing GEMINI_API_KEY. Set GEMINI_API_KEY in .env.local before requesting Gemini rewards.";

export interface GeminiImageRequestConfig {
  readonly apiKey: string;
  readonly model: string;
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
  const configuredModel = env[GEMINI_IMAGE_MODEL_ENV_VAR]?.trim();

  return {
    apiKey: getGeminiApiKey(env),
    model:
      typeof configuredModel === "string" && configuredModel.length > 0
        ? configuredModel
        : GEMINI_IMAGE_MODEL_DEFAULT,
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

function buildAmberRewardPrompt(assetName: string): string {
  return [
    `Create a photorealistic hero product still of ${assetName}.`,
    "The subject is a polished golden amber crystal with fossil-like inclusions and refracted warm light.",
    "Use dramatic studio lighting, shallow depth of field, cinematic contrast, and rich texture detail.",
    "Keep the frame clean, family-friendly, and free of text or logos.",
  ].join(" ");
}

function buildHybridDinosaurPrompt(assetName: string): string {
  return [
    `Create a photorealistic cinematic still of ${assetName}.`,
    "The subject is a believable dinosaur hybrid combining anatomy cues from both source species.",
    "Use Jurassic adventure framing, dense foliage, humid haze, and golden-hour rim lighting.",
    "Keep the tone family-friendly and awe-filled, with no gore or graphic violence.",
  ].join(" ");
}

export function buildRewardImagePrompt(assetName: string): string {
  const sanitizedAssetName = assetName.trim();

  if (sanitizedAssetName.length === 0) {
    throw new Error("assetName must be a non-empty string.");
  }

  if (/^amber\b/i.test(sanitizedAssetName)) {
    return buildAmberRewardPrompt(sanitizedAssetName);
  }

  if (/^hybrid\b/i.test(sanitizedAssetName)) {
    return buildHybridDinosaurPrompt(sanitizedAssetName);
  }

  return buildJurassicParkCinematicPrompt(sanitizedAssetName);
}
