import {
  formatRewardDossierPromptBlock,
  parseHybridGenerationAssetName,
  resolveRewardAssetDossier,
  withCuratedFacts,
  type RewardDinosaurDossier,
} from "./dino-dossiers";
import {
  createOpenAiTextRequestConfig,
  describeOpenAiErrorPayload,
  extractOpenAiResponsesOutputText,
  postOpenAiJson,
  type OpenAiFetch,
  type OpenAiTextRequestConfig,
} from "./openai";

const OPENAI_RESPONSES_PATH = "/responses";
const DOSSIER_MAX_OUTPUT_TOKENS = 900;
const DOSSIER_SCHEMA_NAME = "dinosaur_dossier";

interface OpenAiDossierJsonPayload {
  description: string;
  attributes: string[];
}

export interface OpenAiGeneratedRewardDossier {
  dossier: RewardDinosaurDossier;
  model: string;
  prompt: string;
}

export interface OpenAiDossierRequestBody {
  model: string;
  instructions: string;
  input: string;
  max_output_tokens: number;
  store: false;
  text: {
    format: {
      type: "json_schema";
      name: string;
      strict: true;
      schema: typeof DOSSIER_RESPONSE_JSON_SCHEMA;
    };
  };
}

export interface OpenAiDossierGenerationDependencies {
  getRequestConfig: () => OpenAiTextRequestConfig;
  fetch: OpenAiFetch;
}

/**
 * Structured-output schema. Kept to the strict-mode subset: every property is
 * required (nullable where optional) and no additional properties are allowed.
 */
export const DOSSIER_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    description: { type: "string" },
    attributes: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: ["description", "attributes"],
} as const;

/**
 * The model writes prose only. Every measurement, date, diet and clade the game
 * displays comes from the curated fact sheet, which is supplied in the prompt as
 * VERIFIED FACTS; the model must not contradict it or add numbers of its own.
 */
const DOSSIER_INSTRUCTIONS = [
  "You write short exhibit blurbs for a children's dinosaur learning game.",
  "You are given a VERIFIED FACTS block. Treat it as the only source of truth.",
  "Never contradict it, and never introduce measurements, weights, dates, locations or classifications that are not in it — the game displays those separately from its own data.",
  "Write a vivid, accurate, family-friendly description of two or three sentences that a curious eight-year-old can follow. Prefer concrete, checkable statements over drama.",
  "If the subject is an imaginary engineered hybrid, say plainly that it is not a real animal.",
  "Also return three to six short attribute phrases consistent with the facts.",
  "Respond only with JSON matching the provided schema.",
].join(" ");

const defaultOpenAiDossierDependencies: OpenAiDossierGenerationDependencies = {
  getRequestConfig: () => createOpenAiTextRequestConfig(process.env),
  fetch: (input, init) => fetch(input, init),
};

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function buildDossierPrompt(assetName: string): string {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);

  if (!normalizedAssetName) {
    throw new Error("assetName must be a non-empty string.");
  }

  const curatedDossier = resolveRewardAssetDossier(normalizedAssetName);
  const hybridPair = parseHybridGenerationAssetName(normalizedAssetName);
  const subjectLine = hybridPair
    ? `Write the blurb for "${normalizedAssetName}", an imaginary engineered hybrid of ${hybridPair.firstDinosaurName} and ${hybridPair.secondDinosaurName}.`
    : `Write the blurb for "${normalizedAssetName}".`;

  if (!curatedDossier) {
    return subjectLine;
  }

  return [
    subjectLine,
    "",
    "VERIFIED FACTS (do not contradict, do not add numbers of your own):",
    formatRewardDossierPromptBlock(curatedDossier),
  ].join("\n");
}

export function buildOpenAiDossierRequestBody(model: string, prompt: string): OpenAiDossierRequestBody {
  return {
    model,
    instructions: DOSSIER_INSTRUCTIONS,
    input: prompt,
    max_output_tokens: DOSSIER_MAX_OUTPUT_TOKENS,
    store: false,
    text: {
      format: {
        type: "json_schema",
        name: DOSSIER_SCHEMA_NAME,
        strict: true,
        schema: DOSSIER_RESPONSE_JSON_SCHEMA,
      },
    },
  };
}

function normalizeAttributes(
  value: unknown,
  fallbackAttributes: readonly string[],
): string[] {
  if (!Array.isArray(value)) {
    return [...fallbackAttributes];
  }

  const attributes = value
    .map((entry) => getTrimmedNonEmptyString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 6);

  if (attributes.length < 3) {
    return [...fallbackAttributes];
  }

  return attributes;
}

export function normalizeOpenAiDossierPayload(
  assetName: string,
  payload: unknown,
): RewardDinosaurDossier {
  const curatedDossier = resolveRewardAssetDossier(assetName);
  if (!curatedDossier) {
    throw new Error("No dossier can be generated for this asset.");
  }

  if (!isRecord(payload)) {
    return curatedDossier;
  }

  const description =
    getTrimmedNonEmptyString(payload.description) ?? curatedDossier.description;
  const attributes =
    curatedDossier.kind === "hybrid"
      ? normalizeAttributes(payload.attributes, curatedDossier.attributes)
      : curatedDossier.attributes;

  return withCuratedFacts({
    ...curatedDossier,
    description,
    attributes,
  });
}

export async function generateOpenAiRewardDossier(
  assetName: string,
  dependencies: OpenAiDossierGenerationDependencies = defaultOpenAiDossierDependencies,
): Promise<OpenAiGeneratedRewardDossier> {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);
  if (!normalizedAssetName) {
    throw new Error("assetName must be a non-empty string.");
  }

  const requestConfig = dependencies.getRequestConfig();
  const prompt = buildDossierPrompt(normalizedAssetName);
  const requestBody = buildOpenAiDossierRequestBody(requestConfig.model, prompt);

  console.log("[rewards] submitting OpenAI dossier request", {
    assetName: normalizedAssetName,
    model: requestConfig.model,
  });
  const response = await postOpenAiJson(
    dependencies.fetch,
    requestConfig,
    OPENAI_RESPONSES_PATH,
    requestBody,
  );

  if (!response.ok) {
    throw new Error(
      `OpenAI dossier request failed: ${describeOpenAiErrorPayload(response.payload, response.status)}`,
    );
  }

  const responseText = extractOpenAiResponsesOutputText(response.payload);
  if (!responseText) {
    throw new Error("OpenAI dossier response did not include JSON text.");
  }

  const parsedPayload = JSON.parse(responseText) as OpenAiDossierJsonPayload;
  return {
    dossier: normalizeOpenAiDossierPayload(normalizedAssetName, parsedPayload),
    model: requestConfig.model,
    prompt,
  };
}
