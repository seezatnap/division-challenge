import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  buildHybridDinosaurDossier,
  formatMetersAsMetersAndFeet,
  isAmberRewardAssetName,
  listPrimaryDinosaurDossiers,
  parseHybridGenerationAssetName,
  resolveRewardAssetDossier,
  type RewardDinosaurDossier,
} from "./dino-dossiers";

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

interface RewardDossierArtifactManifestEntry extends RewardDossierArtifact {
  readonly artifactPath: string;
}

interface RewardDossierArtifactManifest {
  readonly generatedAt: string;
  readonly count: number;
  readonly dossiers: readonly RewardDossierArtifactManifestEntry[];
}

let primaryDossierArtifactManifestWrite: Promise<void> | null = null;

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toArtifactSlug(value: string): string {
  const normalizedValue = getTrimmedNonEmptyString(value);

  if (!normalizedValue) {
    throw new Error("value must be a non-empty string.");
  }

  const slug = normalizedValue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0) {
    throw new Error("value must include alphanumeric characters.");
  }

  return slug;
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

function toPrimaryDossierArtifactPath(subjectName: string): string {
  return `/artifacts/dossiers/primary/${toArtifactSlug(subjectName)}.json`;
}

function toHybridDossierArtifactPath(subjectName: string): string {
  return `/artifacts/dossiers/hybrid/${toArtifactSlug(subjectName)}.json`;
}

async function writeArtifactJsonFile(
  absolutePath: string,
  payload: unknown,
): Promise<void> {
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function ensurePrimaryDossierArtifacts(): Promise<void> {
  if (primaryDossierArtifactManifestWrite) {
    return primaryDossierArtifactManifestWrite;
  }

  primaryDossierArtifactManifestWrite = (async () => {
    const generatedAt = new Date().toISOString();
    const primaryDossiers = listPrimaryDinosaurDossiers();
    const manifestEntries: RewardDossierArtifactManifestEntry[] = [];

    for (const dossier of primaryDossiers) {
      const artifact = toRewardDossierArtifact(dossier);
      const artifactPath = toPrimaryDossierArtifactPath(dossier.subjectName);
      const absoluteArtifactPath = path.join(
        PRIMARY_DOSSIER_DIRECTORY,
        `${toArtifactSlug(dossier.subjectName)}.json`,
      );

      await writeArtifactJsonFile(absoluteArtifactPath, {
        generatedAt,
        ...artifact,
      });

      manifestEntries.push({
        ...artifact,
        artifactPath,
      });
    }

    const manifest: RewardDossierArtifactManifest = {
      generatedAt,
      count: manifestEntries.length,
      dossiers: manifestEntries,
    };

    await writeArtifactJsonFile(PRIMARY_DOSSIER_MANIFEST_PATH, manifest);
  })().catch((error) => {
    primaryDossierArtifactManifestWrite = null;
    throw error;
  });

  return primaryDossierArtifactManifestWrite;
}

async function readHybridDossierManifest(): Promise<RewardDossierArtifactManifest> {
  try {
    const rawManifest = await readFile(HYBRID_DOSSIER_MANIFEST_PATH, "utf8");
    const parsedManifest = JSON.parse(rawManifest) as Partial<RewardDossierArtifactManifest>;

    if (!Array.isArray(parsedManifest.dossiers)) {
      throw new Error("hybrid dossier manifest is not an array.");
    }

    const entries = parsedManifest.dossiers.filter(
      (entry): entry is RewardDossierArtifactManifestEntry =>
        Boolean(
          entry &&
            typeof entry === "object" &&
            typeof entry.subjectName === "string" &&
            typeof entry.artifactPath === "string",
        ),
    );

    return {
      generatedAt: new Date().toISOString(),
      count: entries.length,
      dossiers: entries,
    };
  } catch {
    return {
      generatedAt: new Date().toISOString(),
      count: 0,
      dossiers: [],
    };
  }
}

async function writeHybridDossierArtifact(dossier: RewardDinosaurDossier): Promise<void> {
  const generatedAt = new Date().toISOString();
  const artifact = toRewardDossierArtifact(dossier);
  const artifactPath = toHybridDossierArtifactPath(dossier.subjectName);
  const absoluteArtifactPath = path.join(
    HYBRID_DOSSIER_DIRECTORY,
    `${toArtifactSlug(dossier.subjectName)}.json`,
  );

  await writeArtifactJsonFile(absoluteArtifactPath, {
    generatedAt,
    ...artifact,
  });

  const existingManifest = await readHybridDossierManifest();
  const filteredEntries = existingManifest.dossiers.filter(
    (entry) => entry.subjectName.toLowerCase() !== dossier.subjectName.toLowerCase(),
  );
  const nextEntries = [
    ...filteredEntries,
    {
      ...artifact,
      artifactPath,
    },
  ].sort((leftEntry, rightEntry) =>
    leftEntry.subjectName.localeCompare(rightEntry.subjectName, "en", {
      sensitivity: "base",
    }),
  );

  await writeArtifactJsonFile(HYBRID_DOSSIER_MANIFEST_PATH, {
    generatedAt,
    count: nextEntries.length,
    dossiers: nextEntries,
  });
}

export async function ensureRewardDossierArtifacts(assetName: string): Promise<void> {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);

  if (!normalizedAssetName) {
    throw new Error("assetName must be a non-empty string.");
  }

  await ensurePrimaryDossierArtifacts();

  if (isAmberRewardAssetName(normalizedAssetName)) {
    return;
  }

  const hybridPair = parseHybridGenerationAssetName(normalizedAssetName);
  if (hybridPair) {
    await writeHybridDossierArtifact(buildHybridDinosaurDossier(hybridPair));
    return;
  }

  const primaryDossier = resolveRewardAssetDossier(normalizedAssetName);
  if (!primaryDossier) {
    return;
  }

  const primaryArtifactPath = path.join(
    PRIMARY_DOSSIER_DIRECTORY,
    `${toArtifactSlug(primaryDossier.subjectName)}.json`,
  );
  await writeArtifactJsonFile(primaryArtifactPath, {
    generatedAt: new Date().toISOString(),
    ...toRewardDossierArtifact(primaryDossier),
  });
}
