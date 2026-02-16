const GEMINI_API_KEY_ENV_VAR = "GEMINI_API_KEY";

export function getGeminiApiKey(env: NodeJS.ProcessEnv = process.env): string {
  const apiKey = env[GEMINI_API_KEY_ENV_VAR];

  if (typeof apiKey !== "string" || apiKey.trim().length === 0) {
    throw new Error(
      "Missing GEMINI_API_KEY. Add it to .env.local before using Gemini features.",
    );
  }

  return apiKey.trim();
}

export function hasGeminiApiKey(env: NodeJS.ProcessEnv = process.env): boolean {
  try {
    getGeminiApiKey(env);
    return true;
  } catch {
    return false;
  }
}
