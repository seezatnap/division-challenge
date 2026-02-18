import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildHybridDinosaurDossier,
  formatMetersAsMetersAndFeet,
  formatRewardDossierPromptBlock,
  isAmberRewardAssetName,
  parseHybridGenerationAssetName,
  resolveRewardAssetDossier,
  toRewardDossierArtifactSlug,
  type RewardDinosaurDossier,
} from "./dino-dossiers";
import { generateGeminiRewardDossier } from "./gemini-dossier-service";

const DOSSIER_ARTIFACTS_ROOT = path.join(process.cwd(), "public", "artifacts", "dossiers");
const PRIMARY_DOSSIER_DIRECTORY = path.join(DOSSIER_ARTIFACTS_ROOT, "primary");
const HYBRID_DOSSIER_DIRECTORY = path.join(DOSSIER_ARTIFACTS_ROOT, "hybrid");
const PRIMARY_DOSSIER_MANIFEST_PATH = path.join(
  DOSSIER_ARTIFACTS_ROOT,
  "primary-dinosaur-dossiers.json",
);
const HYBRID_DOSSIER_MANIFEST_PATH = path.join(
  DOSSIER_ARTIFACTS_ROOT,
  "hybrid-dinosaur-dossiers.json",
);

type DossierGenerationSource = "gemini" | "deterministic-fallback";

interface RewardDossierArtifact {
  readonly kind: RewardDinosaurDossier["kind"];
  readonly subjectName: string;
  readonly sourceDinosaurs: readonly [string, string] | null;
  readonly dimensions: {
    readonly heightMeters: number;
    readonly lengthMeters: number;
    readonly heightDisplay: string;
    readonly lengthDisplay: string;
  };
  readonly attributes: readonly string[];
  readonly description: string;
}

interface RewardDossierArtifactFile extends RewardDossierArtifact {
  readonly generatedAt: string;
  readonly generator: {
    readonly source: DossierGenerationSource;
    readonly model: string;
    readonly prompt: string;
  };
}

interface RewardDossierArtifactManifestEntry extends RewardDossierArtifact {
  readonly artifactPath: string;
  readonly generator: RewardDossierArtifactFile["generator"];
}

interface RewardDossierArtifactManifest {
  readonly generatedAt: string;
  readonly count: number;
  readonly dossiers: readonly RewardDossierArtifactManifestEntry[];
}

export interface RewardDossierArtifactResolution {
  readonly dossier: RewardDinosaurDossier;
  readonly promptBlock: string;
  readonly artifactPath: string;
  readonly wasRegenerated: boolean;
  readonly source: DossierGenerationSource | "cached";
}

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

function toRewardDossierArtifact(dossier: RewardDinosaurDossier): RewardDossierArtifact {
  return {
    kind: dossier.kind,
    subjectName: dossier.subjectName,
    sourceDinosaurs: dossier.sourceDinosaurs,
    dimensions: {
      heightMeters: dossier.heightMeters,
      lengthMeters: dossier.lengthMeters,
      heightDisplay: formatMetersAsMetersAndFeet(dossier.heightMeters),
      lengthDisplay: formatMetersAsMetersAndFeet(dossier.lengthMeters),
    },
    attributes: [...dossier.attributes],
    description: dossier.description,
  };
}

function toArtifactPublicPath(input: {
  kind: RewardDinosaurDossier["kind"];
  subjectName: string;
}): string {
  const folder = input.kind === "hybrid" ? "hybrid" : "primary";
  return `/artifacts/dossiers/${folder}/${toRewardDossierArtifactSlug(input.subjectName)}.json`;
}

function toAbsoluteArtifactPath(input: {
  kind: RewardDinosaurDossier["kind"];
  subjectName: string;
}): string {
  const folder = input.kind === "hybrid" ? HYBRID_DOSSIER_DIRECTORY : PRIMARY_DOSSIER_DIRECTORY;
  return path.join(folder, `${toRewardDossierArtifactSlug(input.subjectName)}.json`);
}

function toManifestPath(kind: RewardDinosaurDossier["kind"]): string {
  return kind === "hybrid" ? HYBRID_DOSSIER_MANIFEST_PATH : PRIMARY_DOSSIER_MANIFEST_PATH;
}

function toDossierFromArtifactPayload(payload: unknown): RewardDinosaurDossier | null {
  if (!isRecord(payload)) {
    return null;
  }

  const kind = payload.kind === "primary" || payload.kind === "hybrid" ? payload.kind : null;
  const subjectName = getTrimmedNonEmptyString(payload.subjectName);
  const description = getTrimmedNonEmptyString(payload.description);

  if (!kind || !subjectName || !description || !isRecord(payload.dimensions)) {
    return null;
  }

  if (
    typeof payload.dimensions.heightMeters !== "number" ||
    typeof payload.dimensions.lengthMeters !== "number"
  ) {
    return null;
  }

  if (!Array.isArray(payload.attributes)) {
    return null;
  }
  const attributes = payload.attributes
    .map((entry) => getTrimmedNonEmptyString(entry))
    .filter((entry): entry is string => Boolean(entry));

  if (attributes.length === 0) {
    return null;
  }

  let sourceDinosaurs: readonly [string, string] | null = null;
  if (payload.sourceDinosaurs !== null && payload.sourceDinosaurs !== undefined) {
    if (!Array.isArray(payload.sourceDinosaurs) || payload.sourceDinosaurs.length !== 2) {
      return null;
    }

    const firstDinosaurName = getTrimmedNonEmptyString(payload.sourceDinosaurs[0]);
    const secondDinosaurName = getTrimmedNonEmptyString(payload.sourceDinosaurs[1]);
    if (!firstDinosaurName || !secondDinosaurName) {
      return null;
    }

    sourceDinosaurs = [firstDinosaurName, secondDinosaurName];
  }

  return {
    kind,
    subjectName,
    heightMeters: payload.dimensions.heightMeters,
    lengthMeters: payload.dimensions.lengthMeters,
    attributes,
    description,
    sourceDinosaurs,
  };
}

function toGenerationSource(payload: unknown): DossierGenerationSource | null {
  if (!isRecord(payload) || !isRecord(payload.generator)) {
    return null;
  }

  const source = payload.generator.source;
  return source === "gemini" || source === "deterministic-fallback" ? source : null;
}

function shouldReuseExistingArtifact(payload: unknown): boolean {
  return toGenerationSource(payload) === "gemini";
}

async function readJsonFileIfExists(absolutePath: string): Promise<unknown | null> {
  try {
    await access(absolutePath);
  } catch {
    return null;
  }

  try {
    const rawPayload = await readFile(absolutePath, "utf8");
    return JSON.parse(rawPayload);
  } catch {
    return null;
  }
}

async function writeArtifactJsonFile(absolutePath: string, payload: unknown): Promise<void> {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function readManifest(kind: RewardDinosaurDossier["kind"]): Promise<RewardDossierArtifactManifest> {
  const manifestPath = toManifestPath(kind);
  const parsedManifest = await readJsonFileIfExists(manifestPath);

  if (!isRecord(parsedManifest) || !Array.isArray(parsedManifest.dossiers)) {
    return {
      generatedAt: new Date().toISOString(),
      count: 0,
      dossiers: [],
    };
  }

  const dossiers = parsedManifest.dossiers.filter(
    (entry): entry is RewardDossierArtifactManifestEntry =>
      Boolean(
        isRecord(entry) &&
          typeof entry.subjectName === "string" &&
          typeof entry.artifactPath === "string",
      ),
  );

  return {
    generatedAt: new Date().toISOString(),
    count: dossiers.length,
    dossiers,
  };
}

async function upsertManifestEntry(input: {
  dossier: RewardDinosaurDossier;
  generator: RewardDossierArtifactFile["generator"];
}): Promise<void> {
  const artifact = toRewardDossierArtifact(input.dossier);
  const artifactPath = toArtifactPublicPath({
    kind: input.dossier.kind,
    subjectName: input.dossier.subjectName,
  });
  const currentManifest = await readManifest(input.dossier.kind);
  const filteredDossiers = currentManifest.dossiers.filter(
    (entry) => entry.subjectName.toLowerCase() !== input.dossier.subjectName.toLowerCase(),
  );
  const nextDossiers = [
    ...filteredDossiers,
    {
      ...artifact,
      artifactPath,
      generator: input.generator,
    },
  ].sort((leftEntry, rightEntry) =>
    leftEntry.subjectName.localeCompare(rightEntry.subjectName, "en", {
      sensitivity: "base",
    }),
  );

  await writeArtifactJsonFile(toManifestPath(input.dossier.kind), {
    generatedAt: new Date().toISOString(),
    count: nextDossiers.length,
    dossiers: nextDossiers,
  });
}

async function generateDossierForAsset(assetName: string): Promise<{
  dossier: RewardDinosaurDossier;
  generator: RewardDossierArtifactFile["generator"];
}> {
  try {
    const generatedDossier = await generateGeminiRewardDossier(assetName);

    return {
      dossier: generatedDossier.dossier,
      generator: {
        source: "gemini",
        model: generatedDossier.model,
        prompt: generatedDossier.prompt,
      },
    };
  } catch (error) {
    const fallbackDossier =
      resolveRewardAssetDossier(assetName) ??
      (() => {
        const parsedHybridPair = parseHybridGenerationAssetName(assetName);
        if (!parsedHybridPair) {
          throw new Error("Unable to build fallback dossier for this asset.");
        }

        return buildHybridDinosaurDossier(parsedHybridPair);
      })();

    return {
      dossier: fallbackDossier,
      generator: {
        source: "deterministic-fallback",
        model: "local-deterministic-fallback",
        prompt: `Fallback dossier for ${assetName}: ${error instanceof Error ? error.message : "unknown generation error"}`,
      },
    };
  }
}

export function resolveRewardDossierArtifactPath(
  assetName: string,
): string | null {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);
  if (!normalizedAssetName || isAmberRewardAssetName(normalizedAssetName)) {
    return null;
  }

  const hybridPair = parseHybridGenerationAssetName(normalizedAssetName);
  if (hybridPair) {
    const hybridAssetName = `Hybrid ${hybridPair.firstDinosaurName} + ${hybridPair.secondDinosaurName}`;
    return toArtifactPublicPath({
      kind: "hybrid",
      subjectName: hybridAssetName,
    });
  }

  return toArtifactPublicPath({
    kind: "primary",
    subjectName: normalizedAssetName,
  });
}

export async function ensureRewardDossierArtifacts(
  assetName: string,
): Promise<RewardDossierArtifactResolution | null> {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);
  if (!normalizedAssetName) {
    throw new Error("assetName must be a non-empty string.");
  }

  if (isAmberRewardAssetName(normalizedAssetName)) {
    return null;
  }

  const parsedHybridPair = parseHybridGenerationAssetName(normalizedAssetName);
  const normalizedDossierName = parsedHybridPair
    ? `Hybrid ${parsedHybridPair.firstDinosaurName} + ${parsedHybridPair.secondDinosaurName}`
    : normalizedAssetName;
  const dossierKind: RewardDinosaurDossier["kind"] = parsedHybridPair ? "hybrid" : "primary";
  const absoluteArtifactPath = toAbsoluteArtifactPath({
    kind: dossierKind,
    subjectName: normalizedDossierName,
  });
  const artifactPath = toArtifactPublicPath({
    kind: dossierKind,
    subjectName: normalizedDossierName,
  });

  const existingArtifactPayload = await readJsonFileIfExists(absoluteArtifactPath);
  if (existingArtifactPayload && shouldReuseExistingArtifact(existingArtifactPayload)) {
    const parsedDossier = toDossierFromArtifactPayload(existingArtifactPayload);
    if (parsedDossier) {
      return {
        dossier: parsedDossier,
        promptBlock: formatRewardDossierPromptBlock(parsedDossier),
        artifactPath,
        wasRegenerated: false,
        source: "cached",
      };
    }
  }

  const generatedResult = await generateDossierForAsset(normalizedAssetName);
  const artifactPayload: RewardDossierArtifactFile = {
    generatedAt: new Date().toISOString(),
    ...toRewardDossierArtifact(generatedResult.dossier),
    generator: generatedResult.generator,
  };

  await writeArtifactJsonFile(absoluteArtifactPath, artifactPayload);
  await upsertManifestEntry({
    dossier: generatedResult.dossier,
    generator: generatedResult.generator,
  });

  return {
    dossier: generatedResult.dossier,
    promptBlock: formatRewardDossierPromptBlock(generatedResult.dossier),
    artifactPath,
    wasRegenerated: true,
    source: generatedResult.generator.source,
  };
}
