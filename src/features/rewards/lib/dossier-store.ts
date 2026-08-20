/**
 * Database-backed store for reward dossiers, replacing the old
 * `public/artifacts/dossiers/*.json` files (which were git-ignored and so never
 * survived a deploy).
 *
 * Only the model-written prose is stored. Measurements, dates, diet, taxonomy
 * and the info card are re-derived from the curated fact sheet on every read,
 * so a row written months ago — or by a model that hallucinated — cannot put a
 * wrong fact in front of a player.
 */

import {
  executeDatabaseStatement,
  type DatabaseRow,
} from "@/features/persistence/lib/database";

import {
  buildHybridDinosaurDossier,
  isAmberRewardAssetName,
  formatRewardDossierPromptBlock,
  parseHybridGenerationAssetName,
  resolveRewardAssetDossier,
  toRewardDossierArtifactSlug,
  withCuratedFacts,
  type RewardDinosaurDossier,
} from "./dino-dossiers";
import { generateOpenAiRewardDossier } from "./openai-dossier-service";

/**
 * "openai" is the live generator. "gemini" rows were written by the previous
 * provider and remain good prose, so they are reused rather than regenerated.
 * "curated" means the fact-sheet text is being used because generation failed.
 */
export type DossierProseSource = "openai" | "gemini" | "curated";

export interface StoredRewardDossier {
  slug: string;
  subjectName: string;
  kind: RewardDinosaurDossier["kind"];
  description: string;
  attributes: readonly string[];
  source: DossierProseSource;
  model: string;
  prompt: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface RewardDossierResolution {
  readonly dossier: RewardDinosaurDossier;
  readonly promptBlock: string;
  readonly source: DossierProseSource;
  readonly wasRegenerated: boolean;
}

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toNonNegativeInteger(value: unknown): number | null {
  const numericValue = typeof value === "bigint" ? Number(value) : value;
  if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
    return null;
  }

  return Math.max(0, Math.floor(numericValue));
}

function normalizeSource(value: unknown): DossierProseSource {
  return value === "openai" || value === "gemini" ? value : "curated";
}

/** Prose from a previous provider is still good; curated placeholders are not. */
function isReusableSource(source: DossierProseSource): boolean {
  return source === "openai" || source === "gemini";
}

/**
 * Canonical asset name for a reward: hybrids are stored under their normalized
 * "Hybrid A + B" name so either ordering resolves to the same row.
 */
export function toDossierSubjectName(assetName: string): string {
  const hybridPair = parseHybridGenerationAssetName(assetName);
  return hybridPair
    ? `Hybrid ${hybridPair.firstDinosaurName} + ${hybridPair.secondDinosaurName}`
    : assetName.trim();
}

function toStoredRewardDossier(row: DatabaseRow): StoredRewardDossier | null {
  const slug = getTrimmedNonEmptyString(row.slug);
  const subjectName = getTrimmedNonEmptyString(row.subject_name);
  const description = getTrimmedNonEmptyString(row.description);
  if (!slug || !subjectName || !description) {
    return null;
  }

  let attributes: string[] = [];
  try {
    const parsedAttributes: unknown = JSON.parse(String(row.attributes_json ?? "[]"));
    if (Array.isArray(parsedAttributes)) {
      attributes = parsedAttributes
        .map((entry) => getTrimmedNonEmptyString(entry))
        .filter((entry): entry is string => entry !== null);
    }
  } catch {
    attributes = [];
  }

  const createdAtMs = toNonNegativeInteger(row.created_at_ms) ?? 0;

  return {
    slug,
    subjectName,
    kind: row.kind === "hybrid" ? "hybrid" : "primary",
    description,
    attributes,
    source: normalizeSource(row.source),
    model: getTrimmedNonEmptyString(row.model) ?? "unknown-model",
    prompt: getTrimmedNonEmptyString(row.prompt) ?? "",
    createdAtMs,
    updatedAtMs: toNonNegativeInteger(row.updated_at_ms) ?? createdAtMs,
  };
}

export async function readStoredRewardDossier(
  assetName: string,
): Promise<StoredRewardDossier | null> {
  const subjectName = toDossierSubjectName(assetName);

  try {
    const result = await executeDatabaseStatement({
      sql: `
        SELECT slug, subject_name, kind, description, attributes_json, source, model, prompt,
               created_at_ms, updated_at_ms
        FROM reward_dossiers
        WHERE slug = ?
        LIMIT 1
      `,
      args: [toRewardDossierArtifactSlug(subjectName)],
    });

    const row = result.rows[0];
    return row ? toStoredRewardDossier(row) : null;
  } catch (error) {
    console.warn("[rewards] failed to read stored dossier", {
      subjectName,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

export async function listStoredRewardDossiers(): Promise<readonly StoredRewardDossier[]> {
  try {
    const result = await executeDatabaseStatement({
      sql: `
        SELECT slug, subject_name, kind, description, attributes_json, source, model, prompt,
               created_at_ms, updated_at_ms
        FROM reward_dossiers
        ORDER BY subject_name COLLATE NOCASE ASC
      `,
      args: [],
    });

    return result.rows
      .map((row) => toStoredRewardDossier(row))
      .filter((entry): entry is StoredRewardDossier => entry !== null);
  } catch (error) {
    console.warn("[rewards] failed to list stored dossiers", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export interface SaveRewardDossierInput {
  subjectName: string;
  kind: RewardDinosaurDossier["kind"];
  description: string;
  attributes: readonly string[];
  source: DossierProseSource;
  model: string;
  prompt: string;
  createdAtMs?: number;
}

export async function saveRewardDossier(
  input: SaveRewardDossierInput,
): Promise<StoredRewardDossier> {
  const subjectName = toDossierSubjectName(input.subjectName);
  const slug = toRewardDossierArtifactSlug(subjectName);
  const timestampMs = toNonNegativeInteger(input.createdAtMs) ?? Date.now();

  await executeDatabaseStatement({
    sql: `
      INSERT INTO reward_dossiers (
        slug, subject_name, kind, description, attributes_json, source, model, prompt,
        created_at_ms, updated_at_ms
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        subject_name = excluded.subject_name,
        kind = excluded.kind,
        description = excluded.description,
        attributes_json = excluded.attributes_json,
        source = excluded.source,
        model = excluded.model,
        prompt = excluded.prompt,
        updated_at_ms = excluded.updated_at_ms
    `,
    args: [
      slug,
      subjectName,
      input.kind,
      input.description,
      JSON.stringify([...input.attributes]),
      input.source,
      input.model,
      input.prompt,
      timestampMs,
      timestampMs,
    ],
  });

  return {
    slug,
    subjectName,
    kind: input.kind,
    description: input.description,
    attributes: [...input.attributes],
    source: input.source,
    model: input.model,
    prompt: input.prompt,
    createdAtMs: timestampMs,
    updatedAtMs: timestampMs,
  };
}

const RETIRED_DISCLAIMER_PATTERN = /imaginary|not a real animal/i;

/**
 * Prose stored before hybrids were presented in-universe as real DNA-lab
 * creations carries the old "imaginary" disclaimer. Rows with that language
 * are treated as stale so the dossier regenerates under the current prompt.
 */
function hasRetiredDisclaimerLanguage(storedDossier: StoredRewardDossier): boolean {
  return (
    RETIRED_DISCLAIMER_PATTERN.test(storedDossier.description) ||
    storedDossier.attributes.some((attribute) => RETIRED_DISCLAIMER_PATTERN.test(attribute))
  );
}

/**
 * Combines curated facts with stored prose. The curated dossier supplies every
 * factual field; the stored row may only replace the description (and, for
 * lab-engineered hybrids, the attribute phrases).
 */
function toResolvedDossier(
  curatedDossier: RewardDinosaurDossier,
  storedDossier: StoredRewardDossier | null,
): RewardDinosaurDossier {
  if (!storedDossier) {
    return curatedDossier;
  }

  return withCuratedFacts({
    ...curatedDossier,
    description: storedDossier.description,
    attributes:
      curatedDossier.kind === "hybrid" && storedDossier.attributes.length >= 3
        ? storedDossier.attributes
        : curatedDossier.attributes,
  });
}

function resolveCuratedDossier(assetName: string): RewardDinosaurDossier | null {
  const hybridPair = parseHybridGenerationAssetName(assetName);
  return hybridPair ? buildHybridDinosaurDossier(hybridPair) : resolveRewardAssetDossier(assetName);
}

/**
 * Returns the dossier for a reward asset, generating and storing the prose on
 * first use. Amber assets have no dossier and return null. Generation failures
 * degrade to the curated text rather than blocking the reward.
 */
export async function ensureRewardDossier(
  assetName: string,
  dependencies: { generateDossier?: typeof generateOpenAiRewardDossier } = {},
): Promise<RewardDossierResolution | null> {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);
  if (!normalizedAssetName) {
    throw new Error("assetName must be a non-empty string.");
  }

  if (isAmberRewardAssetName(normalizedAssetName)) {
    return null;
  }

  const curatedDossier = resolveCuratedDossier(normalizedAssetName);
  if (!curatedDossier) {
    return null;
  }

  const storedDossier = await readStoredRewardDossier(normalizedAssetName);
  if (
    storedDossier &&
    isReusableSource(storedDossier.source) &&
    !hasRetiredDisclaimerLanguage(storedDossier)
  ) {
    const dossier = toResolvedDossier(curatedDossier, storedDossier);
    return {
      dossier,
      promptBlock: formatRewardDossierPromptBlock(dossier),
      source: storedDossier.source,
      wasRegenerated: false,
    };
  }

  const generateDossier = dependencies.generateDossier ?? generateOpenAiRewardDossier;

  try {
    const generated = await generateDossier(normalizedAssetName);
    const dossier = withCuratedFacts({
      ...curatedDossier,
      description: generated.dossier.description,
      attributes:
        curatedDossier.kind === "hybrid"
          ? generated.dossier.attributes
          : curatedDossier.attributes,
    });

    await saveRewardDossier({
      subjectName: dossier.subjectName,
      kind: dossier.kind,
      description: dossier.description,
      attributes: dossier.attributes,
      source: "openai",
      model: generated.model,
      prompt: generated.prompt,
    }).catch((error) => {
      console.warn("[rewards] failed to store generated dossier", {
        subjectName: dossier.subjectName,
        reason: error instanceof Error ? error.message : String(error),
      });
    });

    return {
      dossier,
      promptBlock: formatRewardDossierPromptBlock(dossier),
      source: "openai",
      wasRegenerated: true,
    };
  } catch (error) {
    console.warn("[rewards] dossier generation failed; using curated text", {
      assetName: normalizedAssetName,
      reason: error instanceof Error ? error.message : String(error),
    });

    return {
      dossier: curatedDossier,
      promptBlock: formatRewardDossierPromptBlock(curatedDossier),
      source: "curated",
      wasRegenerated: false,
    };
  }
}

/** Reads a dossier without ever calling the language model. */
export async function getRewardDossier(
  assetName: string,
): Promise<RewardDossierResolution | null> {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);
  if (!normalizedAssetName || isAmberRewardAssetName(normalizedAssetName)) {
    return null;
  }

  const curatedDossier = resolveCuratedDossier(normalizedAssetName);
  if (!curatedDossier) {
    return null;
  }

  const storedDossier = await readStoredRewardDossier(normalizedAssetName);
  const usableStoredDossier =
    storedDossier &&
    isReusableSource(storedDossier.source) &&
    !hasRetiredDisclaimerLanguage(storedDossier)
      ? storedDossier
      : null;
  const dossier = toResolvedDossier(curatedDossier, usableStoredDossier);

  return {
    dossier,
    promptBlock: formatRewardDossierPromptBlock(dossier),
    source: usableStoredDossier?.source ?? "curated",
    wasRegenerated: false,
  };
}
