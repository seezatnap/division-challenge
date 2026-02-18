import { DINOSAUR_ROSTER } from "./dinosaurs";

const HYBRID_ASSET_NAME_PATTERN = /^hybrid\s+(.+?)\s*\+\s*(.+)$/i;
const AMBER_ASSET_NAME_PATTERN = /^amber\b/i;

const ATTRIBUTE_POOL = [
  "reinforced skull plating",
  "high-traction hind claws",
  "long-range scent tracking",
  "rapid acceleration bursts",
  "stabilizing tail counterbalance",
  "dense osteoderm armor",
  "precision depth vision",
  "heat-regulated dorsal sail",
  "impact-resistant neck vertebrae",
  "broad-spectrum low-light vision",
  "efficient oxygen recovery",
  "silent fern-canopy stalking",
  "powerful bite leverage",
  "shock-absorbing foot pads",
  "wide-turn agility",
  "camouflage skin mottling",
  "high-endurance stride cycle",
  "rapid threat recognition",
] as const;

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

export interface RewardDinosaurDossier extends RewardDossierDimensions {
  readonly kind: RewardDossierKind;
  readonly subjectName: string;
  readonly attributes: readonly string[];
  readonly description: string;
  readonly sourceDinosaurs: readonly [string, string] | null;
}

export interface RewardHybridPair {
  readonly firstDinosaurName: string;
  readonly secondDinosaurName: string;
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

function clampNumber(value: number, minimumValue: number, maximumValue: number): number {
  return Math.min(maximumValue, Math.max(minimumValue, value));
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

function pickDistinctAttributes(seed: number, count: number): string[] {
  const selectedAttributes: string[] = [];
  let cursor = seed;

  while (selectedAttributes.length < count) {
    const nextAttribute = ATTRIBUTE_POOL[cursor % ATTRIBUTE_POOL.length];
    if (!selectedAttributes.includes(nextAttribute)) {
      selectedAttributes.push(nextAttribute);
    }

    cursor = (cursor + 37) >>> 0;
  }

  return selectedAttributes;
}

function findCanonicalDinosaurName(dinosaurName: string): string {
  const normalizedName = normalizeNameOrThrow(dinosaurName, "dinosaurName");
  const canonicalMatch = DINOSAUR_ROSTER.find(
    (candidateName) => candidateName.toLowerCase() === normalizedName.toLowerCase(),
  );

  return canonicalMatch ?? normalizedName;
}

function toPrimaryDinosaurDescription(input: {
  dinosaurName: string;
  attributes: readonly string[];
}): string {
  const [leadTrait = "strong pack instincts", supportTrait = "rapid threat recognition"] =
    input.attributes;

  return `${input.dinosaurName} is profiled as a high-alert apex-era species with ${leadTrait} and ${supportTrait}, built to dominate dense tropical terrain and react quickly to movement.`;
}

export function buildPrimaryDinosaurDossier(dinosaurName: string): RewardDinosaurDossier {
  const canonicalDinosaurName = findCanonicalDinosaurName(dinosaurName);
  const seed = toStableHashSeed(canonicalDinosaurName.toLowerCase());

  const lengthMeters = roundToTenths(5 + ((seed >>> 2) % 141) / 10);
  const rawHeightMeters = roundToTenths(1.8 + ((seed >>> 10) % 63) / 10);
  const maxHeightMeters = roundToTenths(Math.max(2, lengthMeters * 0.64));
  const heightMeters = roundToTenths(clampNumber(rawHeightMeters, 1.8, maxHeightMeters));
  const attributes = pickDistinctAttributes(seed, 3);

  return {
    kind: "primary",
    subjectName: canonicalDinosaurName,
    heightMeters,
    lengthMeters,
    attributes,
    description: toPrimaryDinosaurDescription({
      dinosaurName: canonicalDinosaurName,
      attributes,
    }),
    sourceDinosaurs: null,
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
    HYBRID_SIGNATURE_ATTRIBUTES[seed % HYBRID_SIGNATURE_ATTRIBUTES.length],
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

  return `This engineered hybrid fuses ${input.firstDinosaurName} and ${input.secondDinosaurName}, blending ${leadTrait} with ${secondaryTrait} to create a controlled but high-volatility predator profile.`;
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

export function buildHybridDinosaurDossier(input: RewardHybridPair): RewardDinosaurDossier {
  const normalizedPair = normalizeHybridPair(input);
  const firstDossier = buildPrimaryDinosaurDossier(normalizedPair.firstDinosaurName);
  const secondDossier = buildPrimaryDinosaurDossier(normalizedPair.secondDinosaurName);
  const hybridSeed = toStableHashSeed(
    `${normalizedPair.firstDinosaurName.toLowerCase()}::${normalizedPair.secondDinosaurName.toLowerCase()}`,
  );

  const averageLengthMeters = (firstDossier.lengthMeters + secondDossier.lengthMeters) / 2;
  const averageHeightMeters = (firstDossier.heightMeters + secondDossier.heightMeters) / 2;
  const lengthMeters = roundToTenths(
    clampNumber(averageLengthMeters + (((hybridSeed >>> 5) % 21) - 10) / 10, 4.5, 24),
  );
  const maxHybridHeightMeters = roundToTenths(Math.max(2.2, lengthMeters * 0.68));
  const heightMeters = roundToTenths(
    clampNumber(averageHeightMeters + (((hybridSeed >>> 12) % 17) - 8) / 10, 2, maxHybridHeightMeters),
  );
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
  };
}

export function isAmberRewardAssetName(assetName: string): boolean {
  const normalizedAssetName = getTrimmedNonEmptyString(assetName);

  if (!normalizedAssetName) {
    return false;
  }

  return AMBER_ASSET_NAME_PATTERN.test(normalizedAssetName);
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

export function formatRewardDossierPromptBlock(dossier: RewardDinosaurDossier): string {
  const sourceLine = dossier.sourceDinosaurs
    ? `Source species: ${dossier.sourceDinosaurs[0]} + ${dossier.sourceDinosaurs[1]}.`
    : "Source species: primary catalog profile.";

  return [
    `Field dossier for ${dossier.subjectName}:`,
    `Height: ${formatMetersAsMetersAndFeet(dossier.heightMeters)}.`,
    `Length: ${formatMetersAsMetersAndFeet(dossier.lengthMeters)}.`,
    `Attributes: ${dossier.attributes.join(", ")}.`,
    sourceLine,
    `Description: ${dossier.description}`,
  ].join(" ");
}

export function listPrimaryDinosaurDossiers(): RewardDinosaurDossier[] {
  return DINOSAUR_ROSTER.map((dinosaurName) => buildPrimaryDinosaurDossier(dinosaurName));
}
