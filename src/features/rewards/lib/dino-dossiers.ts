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

const DIET_POOL = [
  "Carnivore (Meat-Eater)",
  "Herbivore (Plant-Eater)",
  "Omnivore (All-Eater)",
  "Piscivore (Fish-Eater)",
] as const;

const TIME_PERIOD_POOL = [
  "Late Cretaceous - 68 to 66 million years ago",
  "Late Jurassic - 155 to 150 million years ago",
  "Early Cretaceous - 130 to 110 million years ago",
  "Late Jurassic to Early Cretaceous - 150 million years ago",
  "Middle Jurassic - 170 to 160 million years ago",
  "Late Triassic - 230 to 210 million years ago",
  "Late Cretaceous - 80 to 72 million years ago",
  "Early Jurassic - 193 to 183 million years ago",
] as const;

const LOCATION_POOL = [
  "Western U.S., Canada",
  "Western U.S., Southern Europe, Northern Africa",
  "Mongolia, China",
  "North America, Europe",
  "South America, Africa",
  "East Asia, Southeast Asia",
  "Northern Africa, Europe",
  "Australia, Antarctica",
] as const;

const TAXON_POOL = [
  "Theropoda, Tyrannosauridae",
  "Sauropodomorpha, Sauropoda, Macronaria",
  "Theropoda, Dromaeosauridae",
  "Ornithischia, Ceratopsidae",
  "Ornithischia, Thyreophora, Stegosauria",
  "Ornithischia, Ornithopoda, Hadrosauridae",
  "Theropoda, Spinosauridae",
  "Theropoda, Abelisauridae",
  "Sauropodomorpha, Diplodocidae",
  "Pterosauria, Pteranodontidae",
] as const;

const NAME_MEANING_POOL = [
  '"tyrant lizard king"',
  '"swift thief"',
  '"three-horned face"',
  '"arm lizard"',
  '"double-crested lizard"',
  '"spine lizard"',
  '"roofed lizard"',
  '"near crested lizard"',
  '"chicken mimic"',
  '"elegant jaw"',
  '"winged and toothless"',
  '"fused lizard"',
  '"thick-headed lizard"',
  '"heavy claw"',
  '"deceptive lizard"',
  '"high chested arm reptile"',
] as const;

function buildInfoCardPronunciation(dinosaurName: string): string {
  const syllables = dinosaurName.replace(/\s+/g, " ").trim().split(/(?=[A-Z])/);
  if (syllables.length <= 1) {
    const name = dinosaurName.toLowerCase();
    const parts: string[] = [];
    let remaining = name;
    while (remaining.length > 0) {
      const chunkLen = Math.min(remaining.length, remaining.length > 4 ? 3 : remaining.length);
      parts.push(remaining.slice(0, chunkLen).replace(/^./, (c) => c.toUpperCase()));
      remaining = remaining.slice(chunkLen);
    }
    return parts.join(" - ");
  }
  return syllables
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase())
    .join(" - ");
}

function buildInfoCardScientificName(dinosaurName: string, seed: number): string {
  const SPECIES_SUFFIXES = [
    "horridus", "rex", "africanus", "mongoliensis", "walkeri",
    "altithorax", "wetherilli", "aegyptiacus", "stenops", "longiceps",
    "saharicus", "fragilis", "robustus", "gracilis", "antiquus",
  ];
  const speciesSuffix = SPECIES_SUFFIXES[seed % SPECIES_SUFFIXES.length];
  const genus = dinosaurName.split(/\s+/)[0];
  return `${genus} ${speciesSuffix}`;
}

function buildPrimaryInfoCard(
  dinosaurName: string,
  seed: number,
  heightMeters: number,
  lengthMeters: number,
): RewardDinosaurInfoCard {
  const diet = DIET_POOL[seed % DIET_POOL.length];
  const timePeriod = TIME_PERIOD_POOL[(seed >>> 3) % TIME_PERIOD_POOL.length];
  const location = LOCATION_POOL[(seed >>> 5) % LOCATION_POOL.length];
  const taxon = TAXON_POOL[(seed >>> 7) % TAXON_POOL.length];
  const nameMeaning = NAME_MEANING_POOL[(seed >>> 4) % NAME_MEANING_POOL.length];
  const weightKg = Math.round(clampNumber(
    lengthMeters * heightMeters * 42 + ((seed >>> 14) % 500),
    80,
    60000,
  ));

  return {
    scientificName: buildInfoCardScientificName(dinosaurName, seed),
    pronunciation: buildInfoCardPronunciation(dinosaurName),
    diet,
    nameMeaning,
    weightKg,
    timePeriod,
    location,
    taxon,
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
    infoCard: buildPrimaryInfoCard(canonicalDinosaurName, seed, heightMeters, lengthMeters),
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

export function toPrimaryRewardDossierArtifactPath(subjectName: string): string {
  return `/artifacts/dossiers/primary/${toRewardDossierArtifactSlug(subjectName)}.json`;
}

export function toHybridRewardDossierArtifactPath(subjectName: string): string {
  return `/artifacts/dossiers/hybrid/${toRewardDossierArtifactSlug(subjectName)}.json`;
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

  return {
    kind,
    subjectName,
    heightMeters,
    lengthMeters,
    attributes,
    description,
    sourceDinosaurs,
    infoCard,
  };
}

export function listPrimaryDinosaurDossiers(): RewardDinosaurDossier[] {
  return DINOSAUR_ROSTER.map((dinosaurName) => buildPrimaryDinosaurDossier(dinosaurName));
}
