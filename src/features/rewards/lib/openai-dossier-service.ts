import {
  parseHybridGenerationAssetName,
  resolveRewardAssetDossier,
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
  subjectName: string;
  heightMeters: number;
  lengthMeters: number;
  attributes: string[];
  description: string;
  sourceDinosaurs: string[] | null;
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
    subjectName: { type: "string" },
    heightMeters: { type: "number" },
    lengthMeters: { type: "number" },
    attributes: {
      type: "array",
      items: { type: "string" },
    },
    description: { type: "string" },
    sourceDinosaurs: {
      anyOf: [{ type: "array", items: { type: "string" } }, { type: "null" }],
    },
  },
  required: [
    "subjectName",
    "heightMeters",
    "lengthMeters",
    "attributes",
    "description",
    "sourceDinosaurs",
  ],
} as const;

const DOSSIER_INSTRUCTIONS = [
  "You are a paleontology reference writer producing a concise, grounded field dossier for a dinosaur-themed learning game.",
  "Return realistic metric dimensions in meters (typical adult height at the hip or head, and total length), three to six short attribute phrases, and a vivid, family-friendly description of two or three sentences.",
  "For a real species, follow the fossil record and current scientific consensus.",
  "For a hybrid, blend the two named parent species plausibly and list them in sourceDinosaurs; for a real species set sourceDinosaurs to null.",
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

function toSafeNumber(value: unknown, fallbackValue: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallbackValue;
  }

  return Math.round(Math.max(0.1, value) * 10) / 10;
}

export function buildDossierPrompt(assetName: string): string {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);

  if (!normalizedAssetName) {
    throw new Error("assetName must be a non-empty string.");
  }

  const hybridPair = parseHybridGenerationAssetName(normalizedAssetName);

  if (hybridPair) {
    return `Create the dossier for "${normalizedAssetName}", a hybrid derived from ${hybridPair.firstDinosaurName} and ${hybridPair.secondDinosaurName}.`;
  }

  return `Create the dossier for the dinosaur "${normalizedAssetName}".`;
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

function normalizeSourceDinosaurs(
  value: unknown,
  fallbackSourceDinosaurs: readonly [string, string] | null,
): readonly [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) {
    return fallbackSourceDinosaurs;
  }

  const firstDinosaurName = getTrimmedNonEmptyString(value[0]);
  const secondDinosaurName = getTrimmedNonEmptyString(value[1]);

  if (!firstDinosaurName || !secondDinosaurName) {
    return fallbackSourceDinosaurs;
  }

  return [firstDinosaurName, secondDinosaurName];
}

export function normalizeOpenAiDossierPayload(
  assetName: string,
  payload: unknown,
): RewardDinosaurDossier {
  const fallbackDossier = resolveRewardAssetDossier(assetName);
  if (!fallbackDossier) {
    throw new Error("No dossier can be generated for this asset.");
  }

  if (!isRecord(payload)) {
    return fallbackDossier;
  }

  const subjectName = getTrimmedNonEmptyString(payload.subjectName) ?? fallbackDossier.subjectName;
  const description =
    getTrimmedNonEmptyString(payload.description) ?? fallbackDossier.description;
  const heightMeters = toSafeNumber(payload.heightMeters, fallbackDossier.heightMeters);
  const lengthMeters = toSafeNumber(payload.lengthMeters, fallbackDossier.lengthMeters);
  const sourceDinosaurs = normalizeSourceDinosaurs(
    payload.sourceDinosaurs,
    fallbackDossier.sourceDinosaurs,
  );
  const attributes = normalizeAttributes(payload.attributes, fallbackDossier.attributes);

  return {
    kind: fallbackDossier.kind,
    subjectName,
    heightMeters,
    lengthMeters,
    attributes,
    description,
    sourceDinosaurs,
    infoCard: fallbackDossier.infoCard,
  };
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
