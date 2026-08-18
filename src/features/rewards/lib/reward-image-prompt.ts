import {
  formatRewardDossierPromptBlock,
  resolveRewardAssetDossier,
} from "./dino-dossiers";

export interface RewardImagePromptInput {
  readonly assetName: string;
  /** Field dossier block (dimensions, attributes, description); optional. */
  readonly dossierPromptBlock?: string | null;
  /**
   * Exact appearance brief produced by the text model. When present it is the
   * authoritative visual reference the image model must follow.
   */
  readonly visualDescription?: string | null;
}

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
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

function buildVisualReferenceBlock(
  visualDescription: string | null,
  subject: "dinosaur" | "hybrid",
): string {
  if (!visualDescription) {
    return "";
  }

  const lead =
    subject === "hybrid"
      ? "Designed appearance of this hybrid — follow it exactly so the animal reads as this specific cross and not as either parent alone:"
      : "Exact appearance reference — follow it precisely so the animal is unmistakably this species and not a generic or look-alike dinosaur:";

  return `${lead} ${visualDescription}`;
}

function buildHybridDinosaurPrompt(
  assetName: string,
  dossierPromptBlock: string,
  visualDescription: string | null,
): string {
  return [
    `Create a photorealistic cinematic still of ${assetName}.`,
    "The subject is a believable dinosaur hybrid combining anatomy cues from both source species.",
    buildVisualReferenceBlock(visualDescription, "hybrid"),
    dossierPromptBlock,
    "Use Jurassic adventure framing, dense foliage, humid haze, and golden-hour rim lighting.",
    "Keep the tone family-friendly and awe-filled, with no gore or graphic violence.",
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

function buildPrimaryDinosaurPrompt(
  assetName: string,
  dossierPromptBlock: string,
  visualDescription: string | null,
): string {
  return [
    buildJurassicParkCinematicPrompt(assetName),
    buildVisualReferenceBlock(visualDescription, "dinosaur"),
    dossierPromptBlock,
  ]
    .filter((part) => part.length > 0)
    .join(" ");
}

export function buildRewardImagePrompt(input: RewardImagePromptInput): string {
  const sanitizedAssetName = getTrimmedNonEmptyString(input.assetName);

  if (!sanitizedAssetName) {
    throw new Error("assetName must be a non-empty string.");
  }

  if (/^amber\b/i.test(sanitizedAssetName)) {
    return buildAmberRewardPrompt(sanitizedAssetName);
  }

  const trimmedDossierPromptBlock = getTrimmedNonEmptyString(input.dossierPromptBlock) ?? "";
  const visualDescription = getTrimmedNonEmptyString(input.visualDescription);
  const resolvedDossier = resolveRewardAssetDossier(sanitizedAssetName);
  const resolvedPromptBlock =
    trimmedDossierPromptBlock.length > 0
      ? trimmedDossierPromptBlock
      : resolvedDossier
        ? formatRewardDossierPromptBlock(resolvedDossier)
        : "";

  if (/^hybrid\b/i.test(sanitizedAssetName)) {
    return buildHybridDinosaurPrompt(sanitizedAssetName, resolvedPromptBlock, visualDescription);
  }

  return buildPrimaryDinosaurPrompt(sanitizedAssetName, resolvedPromptBlock, visualDescription);
}

/** Convenience wrapper preserving the older positional signature. */
export function buildRewardImagePromptWithDossier(
  assetName: string,
  dossierPromptBlock: string | null,
  visualDescription: string | null = null,
): string {
  return buildRewardImagePrompt({ assetName, dossierPromptBlock, visualDescription });
}
