import { GoogleGenAI } from "@google/genai";

import {
  parseHybridGenerationAssetName,
  resolveRewardAssetDossier,
  type RewardDinosaurDossier,
} from "./dino-dossiers";
import { getGeminiApiKey } from "./gemini";

export const GEMINI_DOSSIER_MODEL_ENV_VAR = "GEMINI_DOSSIER_MODEL";
export const GEMINI_DOSSIER_MODEL_DEFAULT = "gemini-3-flash-preview";

interface GeminiDossierJsonPayload {
  subjectName: string;
  heightMeters: number;
  lengthMeters: number;
  attributes: string[];
  description: string;
  sourceDinosaurs?: string[];
}

export interface GeminiGeneratedRewardDossier {
  dossier: RewardDinosaurDossier;
  model: string;
  prompt: string;
}

interface GeminiDossierRequestConfig {
  apiKey: string;
  model: string;
}

type RuntimeEnvironment = Readonly<Record<string, string | undefined>>;

interface GeminiDossierGenerationDependencies {
  getRequestConfig: () => GeminiDossierRequestConfig;
  createClient: (apiKey: string) => {
    models: {
      generateContent(request: {
        model: string;
        contents: string;
        config: {
          tools: [{ googleSearch: Record<string, never> }, { urlContext: Record<string, never> }];
          responseMimeType: "application/json";
          responseJsonSchema: unknown;
        };
      }): Promise<unknown>;
    };
  };
}

const DOSSIER_RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subjectName: { type: "string" },
    heightMeters: { type: "number" },
    lengthMeters: { type: "number" },
    attributes: {
      type: "array",
      items: { type: "string" },
      minItems: 3,
      maxItems: 6,
    },
    description: { type: "string" },
    sourceDinosaurs: {
      type: "array",
      items: { type: "string" },
      minItems: 2,
      maxItems: 2,
    },
  },
  required: ["subjectName", "heightMeters", "lengthMeters", "attributes", "description"],
} as const;

const defaultGeminiDossierDependencies: GeminiDossierGenerationDependencies = {
  getRequestConfig: () => createGeminiDossierRequestConfig(process.env),
  createClient: (apiKey: string) => new GoogleGenAI({ apiKey }),
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

function resolveModel(env: RuntimeEnvironment): string {
  const configuredModel = getTrimmedNonEmptyString(env[GEMINI_DOSSIER_MODEL_ENV_VAR]);
  return configuredModel ?? GEMINI_DOSSIER_MODEL_DEFAULT;
}

export function createGeminiDossierRequestConfig(
  env: RuntimeEnvironment = process.env,
): GeminiDossierRequestConfig {
  return {
    apiKey: getGeminiApiKey(env),
    model: resolveModel(env),
  };
}

function buildDossierPrompt(assetName: string): string {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);

  if (!normalizedAssetName) {
    throw new Error("assetName must be a non-empty string.");
  }

  const hybridPair = parseHybridGenerationAssetName(normalizedAssetName);

  if (hybridPair) {
    return [
      `Create a concise, grounded dinosaur dossier for "${normalizedAssetName}".`,
      `Treat it as a hybrid derived from ${hybridPair.firstDinosaurName} and ${hybridPair.secondDinosaurName}.`,
      "Return realistic metric dimensions in meters, a short attribute list, and a vivid family-friendly description.",
      "Do not include markdown. Return only JSON that matches the schema.",
    ].join(" ");
  }

  return [
    `Create a concise, grounded dinosaur dossier for "${normalizedAssetName}".`,
    "Return realistic metric dimensions in meters, a short attribute list, and a vivid family-friendly description.",
    "Do not include markdown. Return only JSON that matches the schema.",
  ].join(" ");
}

async function resolveGeminiResponsePayload(generateContentResult: unknown): Promise<unknown> {
  if (!isRecord(generateContentResult)) {
    return generateContentResult;
  }

  if (!("response" in generateContentResult)) {
    return generateContentResult;
  }

  try {
    return await Promise.resolve(generateContentResult.response);
  } catch {
    return null;
  }
}

function readGeminiResponseText(responsePayload: unknown): string | null {
  if (!isRecord(responsePayload)) {
    return null;
  }

  if (typeof responsePayload.text === "string") {
    const normalizedText = getTrimmedNonEmptyString(responsePayload.text);
    return normalizedText;
  }

  if (typeof responsePayload.text === "function") {
    try {
      const textResult = responsePayload.text();
      const normalizedText = getTrimmedNonEmptyString(textResult);
      return normalizedText;
    } catch {
      return null;
    }
  }

  return null;
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

function normalizeGeminiDossierPayload(
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
  };
}

export async function generateGeminiRewardDossier(
  assetName: string,
  dependencies: GeminiDossierGenerationDependencies = defaultGeminiDossierDependencies,
): Promise<GeminiGeneratedRewardDossier> {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);
  if (!normalizedAssetName) {
    throw new Error("assetName must be a non-empty string.");
  }

  const requestConfig = dependencies.getRequestConfig();
  const prompt = buildDossierPrompt(normalizedAssetName);
  const client = dependencies.createClient(requestConfig.apiKey);

  console.log("[rewards] submitting Gemini dossier request", {
    assetName: normalizedAssetName,
    model: requestConfig.model,
  });
  const generateContentResult = await client.models.generateContent({
    model: requestConfig.model,
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }, { urlContext: {} }],
      responseMimeType: "application/json",
      responseJsonSchema: DOSSIER_RESPONSE_JSON_SCHEMA,
    },
  });
  const responsePayload = await resolveGeminiResponsePayload(generateContentResult);
  const responseText = readGeminiResponseText(responsePayload);

  if (!responseText) {
    throw new Error("Gemini dossier response did not include JSON text.");
  }

  const parsedPayload = JSON.parse(responseText) as GeminiDossierJsonPayload;
  return {
    dossier: normalizeGeminiDossierPayload(normalizedAssetName, parsedPayload),
    model: requestConfig.model,
    prompt,
  };
}
