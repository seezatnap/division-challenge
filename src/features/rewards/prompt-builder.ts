/**
 * Jurassic Park cinematic prompt builder.
 *
 * Builds reusable prompts for Gemini image-generation requests that
 * produce realistic, Jurassic-Park-style dinosaur artwork.
 */

/**
 * Options accepted by the prompt builder.
 */
export interface DinoPromptOptions {
  /** Name of the dinosaur to depict (e.g. "Tyrannosaurus Rex"). */
  dinosaurName: string;
  /**
   * Optional extra scene direction appended to the core prompt.
   * Example: "standing in shallow water at sunset"
   */
  sceneHint?: string;
}

/**
 * Builds a detailed, cinematic image-generation prompt for a given dinosaur.
 *
 * The prompt is tuned for `gemini-2.0-flash-exp` and requests a
 * photorealistic Jurassic Park / Jurassic World cinematic still.
 *
 * @param options - dinosaur name and optional scene direction
 * @returns the fully-formed prompt string
 * @throws {Error} if dinosaurName is empty
 */
export function buildDinoPrompt(options: DinoPromptOptions): string {
  const name = options.dinosaurName.trim();

  if (name.length === 0) {
    throw new Error("dinosaurName must not be empty.");
  }

  const scenePart = options.sceneHint?.trim()
    ? `, ${options.sceneHint.trim()}`
    : "";

  return [
    `Generate a photorealistic image of a ${name}${scenePart}.`,
    "Style: cinematic still from Jurassic Park / Jurassic World —",
    "dramatic natural lighting, lush prehistoric vegetation,",
    "volumetric fog, shallow depth of field, film grain.",
    "The dinosaur should be scientifically plausible,",
    "detailed skin textures, and fill most of the frame.",
    "No text, watermarks, or human figures.",
  ].join(" ");
}
