import { parseHybridGenerationAssetName } from "./dino-dossiers";
import {
  describeOpenAiErrorPayload,
  extractOpenAiResponsesOutputText,
  postOpenAiJson,
  type OpenAiFetch,
  type OpenAiTextRequestConfig,
} from "./openai";

const OPENAI_RESPONSES_PATH = "/responses";
const VISUAL_DESCRIPTION_MAX_OUTPUT_TOKENS = 700;

export type OpenAiVisualDescriptionErrorCode =
  | "DESCRIPTION_CONFIG_ERROR"
  | "DESCRIPTION_PROMPT_ERROR"
  | "DESCRIPTION_REQUEST_FAILED"
  | "DESCRIPTION_RESPONSE_INVALID"
  | "DESCRIPTION_MISSING";

export class OpenAiVisualDescriptionError extends Error {
  readonly code: OpenAiVisualDescriptionErrorCode;
  readonly cause?: unknown;

  constructor(code: OpenAiVisualDescriptionErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "OpenAiVisualDescriptionError";
    this.code = code;
    this.cause = cause;
  }
}

export interface VisualDescriptionPrompt {
  /** System-style brief telling the model what kind of description to write. */
  readonly instructions: string;
  /** The specific subject (and any reference dossier) to describe. */
  readonly input: string;
  readonly subjectKind: "primary" | "hybrid";
}

export interface OpenAiVisualDescriptionRequestBody {
  model: string;
  instructions: string;
  input: string;
  max_output_tokens: number;
  store: false;
}

export interface OpenAiVisualDescriptionResult {
  readonly assetName: string;
  readonly subjectKind: VisualDescriptionPrompt["subjectKind"];
  readonly model: string;
  readonly prompt: VisualDescriptionPrompt;
  readonly description: string;
}

export interface OpenAiVisualDescriptionDependencies {
  getRequestConfig: () => OpenAiTextRequestConfig;
  fetch: OpenAiFetch;
}

const PRIMARY_DESCRIPTION_INSTRUCTIONS = [
  "You are a paleontological art director briefing an image-generation model.",
  "Describe exactly what the requested dinosaur looked like when alive, following the fossil record and current scientific consensus, so the image model renders this precise species rather than a generic dinosaur.",
  "Cover, in this order: overall body plan and posture; approximate size compared with an adult human; head and skull shape including any crest, horns, frill, dome, or sail; jaws with teeth or beak; neck and tail proportions; limbs, stance (bipedal or quadrupedal), digits and claws; skin covering (scales, osteoderms, feathers, or filaments) and a plausible coloration; then two or three unmistakable identifying features, and the species it is most often confused with along with how to tell them apart.",
  "Write one dense paragraph of roughly 120 to 180 words in plain prose: no headings, no lists, no markdown, no era or behavior details beyond what affects appearance.",
  "Keep it family-friendly and free of gore.",
].join(" ");

const HYBRID_DESCRIPTION_INSTRUCTIONS = [
  "You are a creature designer briefing an image-generation model.",
  "Design a believable hypothetical hybrid of the two named dinosaurs and describe its exact appearance so the image model renders one coherent animal instead of either parent alone.",
  "Start from the defining real anatomy of each parent species (body plan, size, head ornamentation, jaws, limbs and stance, skin covering), then specify precisely which features the hybrid inherits from which parent and how they blend: overall silhouette and size; head and skull features such as crest, horns, frill, beak, or teeth; neck and tail; limbs and stance; skin texture and coloration; and two or three signature features that make it read clearly as a cross of both parents.",
  "Write one dense paragraph of roughly 140 to 200 words in plain prose: no headings, no lists, no markdown.",
  "Keep it family-friendly and free of gore.",
].join(" ");

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function buildVisualDescriptionPrompt(
  assetName: string,
  dossierPromptBlock: string | null,
): VisualDescriptionPrompt {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);

  if (!normalizedAssetName) {
    throw new Error("assetName must be a non-empty string.");
  }

  const referenceLine = getTrimmedNonEmptyString(dossierPromptBlock)
    ? ` Reference dossier (use it for size and traits where it is consistent with the fossil record): ${dossierPromptBlock!.trim()}`
    : "";
  const hybridPair = parseHybridGenerationAssetName(normalizedAssetName);

  if (hybridPair) {
    return {
      subjectKind: "hybrid",
      instructions: HYBRID_DESCRIPTION_INSTRUCTIONS,
      input: `Hybrid name: ${normalizedAssetName}. Parent species: ${hybridPair.firstDinosaurName} and ${hybridPair.secondDinosaurName}.${referenceLine}`,
    };
  }

  return {
    subjectKind: "primary",
    instructions: PRIMARY_DESCRIPTION_INSTRUCTIONS,
    input: `Dinosaur: ${normalizedAssetName}.${referenceLine}`,
  };
}

export function buildOpenAiVisualDescriptionRequestBody(
  model: string,
  prompt: VisualDescriptionPrompt,
): OpenAiVisualDescriptionRequestBody {
  return {
    model,
    instructions: prompt.instructions,
    input: prompt.input,
    max_output_tokens: VISUAL_DESCRIPTION_MAX_OUTPUT_TOKENS,
    store: false,
  };
}

export async function generateOpenAiVisualDescription(
  assetName: string,
  dossierPromptBlock: string | null,
  dependencies: OpenAiVisualDescriptionDependencies,
): Promise<OpenAiVisualDescriptionResult> {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);
  if (!normalizedAssetName) {
    throw new OpenAiVisualDescriptionError(
      "DESCRIPTION_PROMPT_ERROR",
      "assetName must be a non-empty string.",
    );
  }

  let config: OpenAiTextRequestConfig;
  try {
    config = dependencies.getRequestConfig();
  } catch (cause) {
    throw new OpenAiVisualDescriptionError(
      "DESCRIPTION_CONFIG_ERROR",
      "OpenAI configuration is missing or invalid.",
      cause,
    );
  }

  let prompt: VisualDescriptionPrompt;
  try {
    prompt = buildVisualDescriptionPrompt(normalizedAssetName, dossierPromptBlock);
  } catch (cause) {
    throw new OpenAiVisualDescriptionError(
      "DESCRIPTION_PROMPT_ERROR",
      "Failed to build the visual description prompt.",
      cause,
    );
  }

  const requestBody = buildOpenAiVisualDescriptionRequestBody(config.model, prompt);

  let response;
  try {
    console.log("[rewards] submitting OpenAI visual description request", {
      assetName: normalizedAssetName,
      subjectKind: prompt.subjectKind,
      model: config.model,
    });
    response = await postOpenAiJson(dependencies.fetch, config, OPENAI_RESPONSES_PATH, requestBody);
  } catch (cause) {
    throw new OpenAiVisualDescriptionError(
      "DESCRIPTION_REQUEST_FAILED",
      "OpenAI visual description request failed.",
      cause,
    );
  }

  if (!response.ok) {
    throw new OpenAiVisualDescriptionError(
      "DESCRIPTION_REQUEST_FAILED",
      `OpenAI visual description request failed: ${describeOpenAiErrorPayload(response.payload, response.status)}`,
    );
  }

  let description: string | null;
  try {
    description = extractOpenAiResponsesOutputText(response.payload);
  } catch (cause) {
    throw new OpenAiVisualDescriptionError(
      "DESCRIPTION_RESPONSE_INVALID",
      cause instanceof Error ? cause.message : "OpenAI visual description response was invalid.",
      cause,
    );
  }

  if (!description) {
    throw new OpenAiVisualDescriptionError(
      "DESCRIPTION_MISSING",
      "OpenAI visual description response did not include any text.",
    );
  }

  return {
    assetName: normalizedAssetName,
    subjectKind: prompt.subjectKind,
    model: config.model,
    prompt,
    description,
  };
}
