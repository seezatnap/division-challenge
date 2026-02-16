/**
 * Server-side environment configuration.
 * Only import this module in server components or API routes.
 */

export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local (see .env.local.example)."
    );
  }
  return key;
}
