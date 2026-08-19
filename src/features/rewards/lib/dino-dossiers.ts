import {
  formatDietForDisplay,
  formatTaxonForDisplay,
  formatTimePeriodForDisplay,
  getDinosaurFactSheet,
  type DinosaurFactSheet,
} from "./dinosaur-facts";
import { DINOSAUR_ROSTER } from "./dinosaurs";

const HYBRID_ASSET_NAME_PATTERN = /^hybrid\s+(.+?)\s*\+\s*(.+)$/i;
const AMBER_ASSET_NAME_PATTERN = /^amber\b/i;

const HYBRID_SIGNATURE_ATTRIBUTES = [
  "mosaic gene stability",
  "adaptive gait balancing",
  "cross-species sensory fusion",
  "volatile burst acceleration",
  "high-pressure bite transfer",
  "wide-spectrum threat mapping",
  "reinforced cartilage weave",
  "temperature-adaptive metabolism",
] as const;

export type RewardDossierKind = "primary" | "hybrid";

export interface RewardDossierDimensions {
  readonly heightMeters: number;
  readonly lengthMeters: number;
}

export interface RewardDinosaurInfoCard {
  readonly scientificName: string;
  readonly pronunciation: string;
  readonly diet: string;
  readonly nameMeaning: string;
  readonly weightKg: number;
  readonly timePeriod: string;
  readonly location: string;
  readonly taxon: string;
}

export interface RewardDinosaurDossier extends RewardDossierDimensions {
  readonly kind: RewardDossierKind;
  readonly subjectName: string;
  readonly attributes: readonly string[];
  readonly description: string;
  readonly sourceDinosaurs: readonly [string, string] | null;
  readonly infoCard: RewardDinosaurInfoCard | null;
}

export interface RewardHybridPair {
  readonly firstDinosaurName: string;
  readonly secondDinosaurName: string;
}

interface RewardDinosaurDossierArtifactPayload {
  readonly kind?: unknown;
  readonly subjectName?: unknown;
  readonly sourceDinosaurs?: unknown;
  readonly dimensions?: unknown;
  readonly attributes?: unknown;
  readonly description?: unknown;
}

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toStableHashSeed(value: string): number {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function roundToTenths(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeNameOrThrow(value: string, argumentName: string): string {
  const normalizedValue = getTrimmedNonEmptyString(value);

  if (!normalizedValue) {
    throw new Error(`${argumentName} must be a non-empty string.`);
  }

  return normalizedValue;
}

export function toRewardDossierArtifactSlug(value: string): string {
  const normalizedValue = normalizeNameOrThrow(value, "value");
  const slug = normalizedValue
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0) {
    throw new Error("value must include alphanumeric characters.");
  }

  return slug;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeHybridPair(input: RewardHybridPair): RewardHybridPair {
  const firstDinosaurName = normalizeNameOrThrow(input.firstDinosaurName, "firstDinosaurName");
  const secondDinosaurName = normalizeNameOrThrow(input.secondDinosaurName, "secondDinosaurName");

  const sortedPair = [firstDinosaurName, secondDinosaurName].sort((leftName, rightName) =>
    leftName.localeCompare(rightName, "en", { sensitivity: "base" }),
  );

  return {
    firstDinosaurName: sortedPair[0],
    secondDinosaurName: sortedPair[1],
  };
}

function findCanonicalDinosaurName(dinosaurName: string): string {
  const normalizedName = normalizeNameOrThrow(dinosaurName, "dinosaurName");
  const canonicalMatch = DINOSAUR_ROSTER.find(
    (candidateName) => candidateName.toLowerCase() === normalizedName.toLowerCase(),
  );

  return canonicalMatch ?? normalizedName;
}

function buildInfoCardFromFactSheet(factSheet: DinosaurFactSheet): RewardDinosaurInfoCard {
  return {
    scientificName: factSheet.scientificName,
    pronunciation: factSheet.pronunciation,
    diet: formatDietForDisplay(factSheet.diet),
    nameMeaning: `"${factSheet.nameMeaning}"`,
    weightKg: factSheet.weightKg,
    timePeriod: formatTimePeriodForDisplay(factSheet),
    location: factSheet.location,
    taxon: formatTaxonForDisplay(factSheet),
  };
}

export function formatWeightForDisplay(weightKg: number): string {
  if (weightKg >= 1000) {
    const tons = roundToTenths(weightKg / 1000);
    return `${tons} tons (${weightKg.toLocaleString("en-US")} kg)`;
  }
  const lbs = Math.round(weightKg * 2.20462);
  return `${weightKg} kg (${lbs} lbs)`;
}

/**
 * Builds the dossier for a catalogue animal entirely from its curated fact
 * sheet. A name with no fact sheet gets a profile that states the data is
 * missing rather than one filled with plausible-looking invented values;
 * callers detect that case via `infoCard === null` and zero dimensions.
 */
export function buildPrimaryDinosaurDossier(dinosaurName: string): RewardDinosaurDossier {
  const canonicalDinosaurName = findCanonicalDinosaurName(dinosaurName);
  const factSheet = getDinosaurFactSheet(canonicalDinosaurName);

  if (!factSheet) {
    return {
      kind: "primary",
      subjectName: canonicalDinosaurName,
      heightMeters: 0,
      lengthMeters: 0,
      attributes: [],
      description: `${canonicalDinosaurName} is not in the Research Center catalogue yet, so no verified field data is on file.`,
      sourceDinosaurs: null,
      infoCard: null,
    };
  }

  return {
    kind: "primary",
    subjectName: canonicalDinosaurName,
    heightMeters: factSheet.heightMeters,
    lengthMeters: factSheet.lengthMeters,
    attributes: [...factSheet.traits],
    description: factSheet.description,
    sourceDinosaurs: null,
    infoCard: buildInfoCardFromFactSheet(factSheet),
  };
}

function mergeHybridAttributes(
  firstDossier: RewardDinosaurDossier,
  secondDossier: RewardDinosaurDossier,
  seed: number,
): string[] {
  const mergedAttributes = [
    ...firstDossier.attributes.slice(0, 2),
    ...secondDossier.attributes.slice(0, 2),
    `engineered trait: ${HYBRID_SIGNATURE_ATTRIBUTES[seed % HYBRID_SIGNATURE_ATTRIBUTES.length]}`,
  ];

  const uniqueAttributes = Array.from(new Set(mergedAttributes));
  return uniqueAttributes.slice(0, 4);
}

function toHybridDescription(input: {
  firstDinosaurName: string;
  secondDinosaurName: string;
  attributes: readonly string[];
}): string {
  const [leadTrait = "cross-species adaptation", secondaryTrait = "rapid threat recognition"] =
    input.attributes;

  return `This is an imaginary engineered hybrid, not a real animal: it blends ${input.firstDinosaurName} and ${input.secondDinosaurName}, mixing ${leadTrait} with ${secondaryTrait}. Its listed size is the average of its two real parent species.`;
}

export function buildHybridGenerationAssetName(input: RewardHybridPair): string {
  const normalizedPair = normalizeHybridPair(input);
  return `Hybrid ${normalizedPair.firstDinosaurName} + ${normalizedPair.secondDinosaurName}`;
}

export function parseHybridGenerationAssetName(assetName: string): RewardHybridPair | null {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);

  if (!normalizedAssetName) {
    return null;
  }

  const matchedPair = normalizedAssetName.match(HYBRID_ASSET_NAME_PATTERN);
  if (!matchedPair) {
    return null;
  }

  const firstDinosaurName = getTrimmedNonEmptyString(matchedPair[1]);
  const secondDinosaurName = getTrimmedNonEmptyString(matchedPair[2]);

  if (!firstDinosaurName || !secondDinosaurName) {
    return null;
  }

  if (firstDinosaurName.toLowerCase() === secondDinosaurName.toLowerCase()) {
    return null;
  }

  return normalizeHybridPair({
    firstDinosaurName,
    secondDinosaurName,
  });
}

/**
 * Hybrids are film-style fiction, so their profile is explicitly framed as an
 * engineered blend: dimensions are the plain average of the two real parents
 * (no random jitter), and the info card stays null because there is no real
 * animal to describe.
 */
export function buildHybridDinosaurDossier(input: RewardHybridPair): RewardDinosaurDossier {
  const normalizedPair = normalizeHybridPair(input);
  const firstDossier = buildPrimaryDinosaurDossier(normalizedPair.firstDinosaurName);
  const secondDossier = buildPrimaryDinosaurDossier(normalizedPair.secondDinosaurName);
  const hybridSeed = toStableHashSeed(
    `${normalizedPair.firstDinosaurName.toLowerCase()}::${normalizedPair.secondDinosaurName.toLowerCase()}`,
  );

  const averageOfKnownValues = (values: readonly number[]): number => {
    const knownValues = values.filter((value) => value > 0);
    if (knownValues.length === 0) {
      return 0;
    }

    return roundToTenths(
      knownValues.reduce((total, value) => total + value, 0) / knownValues.length,
    );
  };

  const lengthMeters = averageOfKnownValues([
    firstDossier.lengthMeters,
    secondDossier.lengthMeters,
  ]);
  const heightMeters = averageOfKnownValues([
    firstDossier.heightMeters,
    secondDossier.heightMeters,
  ]);
  const attributes = mergeHybridAttributes(firstDossier, secondDossier, hybridSeed);
  const subjectName = buildHybridGenerationAssetName(normalizedPair);

  return {
    kind: "hybrid",
    subjectName,
    heightMeters,
    lengthMeters,
    attributes,
    description: toHybridDescription({
      firstDinosaurName: normalizedPair.firstDinosaurName,
      secondDinosaurName: normalizedPair.secondDinosaurName,
      attributes,
    }),
    sourceDinosaurs: [
      normalizedPair.firstDinosaurName,
      normalizedPair.secondDinosaurName,
    ],
    infoCard: null,
  };
}

export function isAmberRewardAssetName(assetName: string): boolean {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);

  if (!normalizedAssetName) {
    return false;
  }

  return AMBER_ASSET_NAME_PATTERN.test(normalizedAssetName);
}

/** Endpoint the client reads a dossier from (prose in the database, facts local). */
export function toRewardDossierApiPath(assetName: string): string {
  return `/api/rewards/dossier?assetName=${encodeURIComponent(assetName.trim())}`;
}

/** Serialisable payload shape understood by `parseRewardDinosaurDossierArtifact`. */
export function toRewardDossierArtifactPayload(dossier: RewardDinosaurDossier): {
  kind: RewardDossierKind;
  subjectName: string;
  sourceDinosaurs: readonly [string, string] | null;
  dimensions: { heightMeters: number; lengthMeters: number };
  attributes: readonly string[];
  description: string;
  infoCard: RewardDinosaurInfoCard | null;
} {
  return {
    kind: dossier.kind,
    subjectName: dossier.subjectName,
    sourceDinosaurs: dossier.sourceDinosaurs,
    dimensions: {
      heightMeters: dossier.heightMeters,
      lengthMeters: dossier.lengthMeters,
    },
    attributes: dossier.attributes,
    description: dossier.description,
    infoCard: dossier.infoCard,
  };
}

export function resolveRewardAssetDossier(assetName: string): RewardDinosaurDossier | null {
  const normalizedAssetName = normalizeNameOrThrow(assetName, "assetName");

  if (isAmberRewardAssetName(normalizedAssetName)) {
    return null;
  }

  const hybridPair = parseHybridGenerationAssetName(normalizedAssetName);
  if (hybridPair) {
    return buildHybridDinosaurDossier(hybridPair);
  }

  return buildPrimaryDinosaurDossier(normalizedAssetName);
}

export function formatMetersAsMetersAndFeet(meters: number): string {
  const normalizedMeters = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  const feet = normalizedMeters * 3.28084;

  return `${normalizedMeters.toFixed(1)} m (${feet.toFixed(1)} ft)`;
}

/**
 * Ground-truth block handed to the image and text models. For catalogue
 * animals it carries the curated facts verbatim so a render cannot drift into
 * the wrong body plan (feathered raptors, sail-backed Spinosaurus) and a
 * generated description cannot contradict the info card.
 */
export function formatRewardDossierPromptBlock(dossier: RewardDinosaurDossier): string {
  const factSheet =
    dossier.kind === "primary" ? getDinosaurFactSheet(dossier.subjectName) : null;

  const lines = [`Field dossier for ${dossier.subjectName}:`];

  if (factSheet) {
    lines.push(
      `Scientific name: ${factSheet.scientificName}.`,
      `Group: ${formatTaxonForDisplay(factSheet)}.`,
      `Diet: ${formatDietForDisplay(factSheet.diet)}.`,
      `Lived: ${formatTimePeriodForDisplay(factSheet)}.`,
      `Found in: ${factSheet.location}.`,
    );
  }

  if (dossier.heightMeters > 0) {
    lines.push(`Height: ${formatMetersAsMetersAndFeet(dossier.heightMeters)}.`);
  }

  if (dossier.lengthMeters > 0) {
    lines.push(`Length: ${formatMetersAsMetersAndFeet(dossier.lengthMeters)}.`);
  }

  if (factSheet) {
    lines.push(`Weight: ${formatWeightForDisplay(factSheet.weightKg)}.`);
  }

  if (dossier.attributes.length > 0) {
    lines.push(`Attributes: ${dossier.attributes.join(", ")}.`);
  }

  lines.push(
    dossier.sourceDinosaurs
      ? `Source species: ${dossier.sourceDinosaurs[0]} + ${dossier.sourceDinosaurs[1]} (imaginary hybrid).`
      : "Source species: primary catalog profile.",
    `Description: ${dossier.description}`,
  );

  return lines.join(" ");
}

export function parseRewardDinosaurDossierArtifact(
  payload: unknown,
): RewardDinosaurDossier | null {
  if (!isRecord(payload)) {
    return null;
  }

  const parsedPayload = payload as RewardDinosaurDossierArtifactPayload;
  const kind = parsedPayload.kind === "primary" || parsedPayload.kind === "hybrid"
    ? parsedPayload.kind
    : null;
  const subjectName = getTrimmedNonEmptyString(parsedPayload.subjectName);
  const description = getTrimmedNonEmptyString(parsedPayload.description);

  if (!kind || !subjectName || !description || !isRecord(parsedPayload.dimensions)) {
    return null;
  }

  const heightMeters = parsedPayload.dimensions.heightMeters;
  const lengthMeters = parsedPayload.dimensions.lengthMeters;
  if (
    typeof heightMeters !== "number" ||
    Number.isNaN(heightMeters) ||
    typeof lengthMeters !== "number" ||
    Number.isNaN(lengthMeters)
  ) {
    return null;
  }

  if (!Array.isArray(parsedPayload.attributes)) {
    return null;
  }

  const attributes = parsedPayload.attributes
    .map((entry) => getTrimmedNonEmptyString(entry))
    .filter((entry): entry is string => Boolean(entry));

  if (attributes.length === 0) {
    return null;
  }

  let sourceDinosaurs: readonly [string, string] | null = null;
  if (parsedPayload.sourceDinosaurs !== null && parsedPayload.sourceDinosaurs !== undefined) {
    if (!Array.isArray(parsedPayload.sourceDinosaurs) || parsedPayload.sourceDinosaurs.length !== 2) {
      return null;
    }

    const firstDinosaurName = getTrimmedNonEmptyString(parsedPayload.sourceDinosaurs[0]);
    const secondDinosaurName = getTrimmedNonEmptyString(parsedPayload.sourceDinosaurs[1]);
    if (!firstDinosaurName || !secondDinosaurName) {
      return null;
    }

    sourceDinosaurs = [firstDinosaurName, secondDinosaurName];
  }

  let infoCard: RewardDinosaurInfoCard | null = null;
  const rawInfoCard = (payload as Record<string, unknown>).infoCard;
  if (isRecord(rawInfoCard)) {
    const scientificName = getTrimmedNonEmptyString(rawInfoCard.scientificName);
    const pronunciation = getTrimmedNonEmptyString(rawInfoCard.pronunciation);
    const diet = getTrimmedNonEmptyString(rawInfoCard.diet);
    const nameMeaning = getTrimmedNonEmptyString(rawInfoCard.nameMeaning);
    const timePeriod = getTrimmedNonEmptyString(rawInfoCard.timePeriod);
    const location = getTrimmedNonEmptyString(rawInfoCard.location);
    const taxon = getTrimmedNonEmptyString(rawInfoCard.taxon);
    const weightKg = typeof rawInfoCard.weightKg === "number" && !Number.isNaN(rawInfoCard.weightKg)
      ? rawInfoCard.weightKg
      : null;

    if (scientificName && pronunciation && diet && nameMeaning && timePeriod && location && taxon && weightKg !== null) {
      infoCard = { scientificName, pronunciation, diet, nameMeaning, weightKg, timePeriod, location, taxon };
    }
  }

  const parsedDossier: RewardDinosaurDossier = {
    kind,
    subjectName,
    heightMeters,
    lengthMeters,
    attributes,
    description,
    sourceDinosaurs,
    infoCard,
  };

  return withCuratedFacts(parsedDossier);
}

/**
 * Facts always win over stored content. A stored dossier (whether written by a
 * model or migrated from an older build) may only contribute prose: its
 * measurements, traits and info card are replaced with the curated fact sheet
 * so a stale or hallucinated value can never reach a player.
 */
export function withCuratedFacts(dossier: RewardDinosaurDossier): RewardDinosaurDossier {
  if (dossier.kind !== "primary") {
    return { ...dossier, infoCard: null };
  }

  const factSheet = getDinosaurFactSheet(dossier.subjectName);
  if (!factSheet) {
    return { ...dossier, infoCard: null };
  }

  return {
    ...dossier,
    subjectName: findCanonicalDinosaurName(dossier.subjectName),
    heightMeters: factSheet.heightMeters,
    lengthMeters: factSheet.lengthMeters,
    attributes: [...factSheet.traits],
    sourceDinosaurs: null,
    infoCard: buildInfoCardFromFactSheet(factSheet),
  };
}

export function listPrimaryDinosaurDossiers(): RewardDinosaurDossier[] {
  return DINOSAUR_ROSTER.map((dinosaurName) => buildPrimaryDinosaurDossier(dinosaurName));
}
