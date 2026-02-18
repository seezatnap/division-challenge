import type { RewardDinosaurDossier } from "@/features/rewards/lib/dino-dossiers";

export interface ResearchCenterDataSheetRow {
  readonly label:
    | "Name"
    | "Scientific name"
    | "Pronunciation"
    | "Diet"
    | "Name meaning"
    | "Length"
    | "Height"
    | "Weight"
    | "Time period"
    | "Location"
    | "Taxon";
  readonly value: string;
}

export interface ResearchCenterDinosaurProfile {
  readonly description: string;
  readonly rows: readonly ResearchCenterDataSheetRow[];
}

interface ResearchCenterDetailOverride {
  readonly scientificName: string;
  readonly pronunciation: string;
  readonly diet: string;
  readonly nameMeaning: string;
  readonly length: string;
  readonly height: string;
  readonly weight: string;
  readonly timePeriod: string;
  readonly location: string;
  readonly taxon: string;
  readonly description: string;
}

const BRACHIOSAURUS_PROFILE_OVERRIDE: ResearchCenterDetailOverride = {
  scientificName: "Brachiosaurus altithorax",
  pronunciation: "Bra - key - o - saw - rus",
  diet: "Herbivore (Plant-Eater)",
  nameMeaning: "\"high chested arm reptile\"",
  length: "80 feet (25 m)",
  height: "40 feet (12 m)",
  weight: "60 tons (54,500 kilos)",
  timePeriod: "Late Jurassic to Early Cretaceous - 150 million years ago",
  location: "Western U.S., Southern Europe, Northern Africa",
  taxon: "Sauropodomorpha, Sauropoda, Macronaria",
  description:
    "Until recently, Brachiosaurus was the largest known dinosaur and could browse high treetops with its long forelimbs and upright neck.",
};

const HERBIVORE_DINOSAURS = new Set([
  "ankylosaurus",
  "apatosaurus",
  "brachiosaurus",
  "corythosaurus",
  "dreadnoughtus",
  "edmontosaurus",
  "gallimimus",
  "hadrosaurus",
  "iguanodon",
  "lambeosaurus",
  "maiasaura",
  "mamenchisaurus",
  "nigersaurus",
  "ornithomimus",
  "parasaurolophus",
  "protoceratops",
  "sinoceratops",
  "stegosaurus",
  "triceratops",
]);

const CARNIVORE_DINOSAURS = new Set([
  "acrocanthosaurus",
  "allosaurus",
  "atrociraptor",
  "baryonyx",
  "carnotaurus",
  "ceratosaurus",
  "deinonychus",
  "dilophosaurus",
  "giganotosaurus",
  "indominus rex",
  "indoraptor",
  "irritator",
  "majungasaurus",
  "megalosaurus",
  "proceratosaurus",
  "pyroraptor",
  "rajasaurus",
  "spinosaurus",
  "tyrannosaurus rex",
  "utahraptor",
  "velociraptor",
]);

function normalizeNameKey(value: string): string {
  return value.trim().toLowerCase();
}

function formatMetersAsFeetThenMeters(meters: number): string {
  const safeMeters = Number.isFinite(meters) ? Math.max(0, meters) : 0;
  const roundedMeters = Math.max(1, Math.round(safeMeters));
  const roundedFeet = Math.max(1, Math.round(safeMeters * 3.28084));

  return `${roundedFeet} feet (${roundedMeters} m)`;
}

function toScientificName(dinosaurName: string): string {
  const normalizedWords = dinosaurName
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());

  if (normalizedWords.length === 0) {
    return "Unknown sp.";
  }

  if (normalizedWords.length === 1) {
    const [genusName] = normalizedWords;
    const formattedGenusName = genusName.charAt(0).toUpperCase() + genusName.slice(1);
    return `${formattedGenusName} sp.`;
  }

  const [genusName, speciesName] = normalizedWords;
  const formattedGenusName = genusName.charAt(0).toUpperCase() + genusName.slice(1);
  return `${formattedGenusName} ${speciesName}`;
}

function toPronunciation(dinosaurName: string): string {
  return dinosaurName
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0)
    .join(" - ");
}

function toDiet(dinosaurName: string): string {
  const normalizedName = normalizeNameKey(dinosaurName);
  if (HERBIVORE_DINOSAURS.has(normalizedName)) {
    return "Herbivore";
  }

  if (CARNIVORE_DINOSAURS.has(normalizedName)) {
    return "Carnivore";
  }

  return "Omnivore";
}

function toNameMeaning(dinosaurName: string): string {
  const primaryWord = dinosaurName
    .trim()
    .split(/\s+/)
    .find((word) => word.length > 0);

  if (!primaryWord) {
    return "\"unknown reptile\"";
  }

  const normalizedWord = primaryWord.toLowerCase();
  if (normalizedWord.endsWith("saurus")) {
    const rootWord = normalizedWord.slice(0, -7);
    if (rootWord.length > 0) {
      return `"${rootWord} lizard"`;
    }
  }

  return `"${normalizedWord} reptile"`;
}

function toEstimatedWeight(dossier: RewardDinosaurDossier): string {
  const estimatedKilograms = Math.max(
    400,
    Math.round(
      Math.max(dossier.heightMeters, 1.2) * Math.max(dossier.lengthMeters, 2.4) * 185,
    ),
  );
  const estimatedTons = estimatedKilograms / 907.185;
  return `${estimatedTons.toFixed(1)} tons (${estimatedKilograms.toLocaleString("en-US")} kilos)`;
}

function toTaxon(dossier: RewardDinosaurDossier): string {
  if (dossier.kind === "hybrid") {
    return "Hybrid clade, Laboratory synthesis";
  }

  return toDiet(dossier.subjectName) === "Herbivore"
    ? "Dinosauria, Ornithischia/Sauropodomorpha"
    : "Dinosauria, Theropoda";
}

function toResearchCenterOverride(dinosaurName: string): ResearchCenterDetailOverride | null {
  if (normalizeNameKey(dinosaurName) === "brachiosaurus") {
    return BRACHIOSAURUS_PROFILE_OVERRIDE;
  }

  return null;
}

export function buildResearchCenterDinosaurProfile(
  dinosaurName: string,
  dossier: RewardDinosaurDossier,
): ResearchCenterDinosaurProfile {
  const override = toResearchCenterOverride(dinosaurName);
  const rows: ResearchCenterDataSheetRow[] = override
    ? [
        { label: "Name", value: dinosaurName },
        { label: "Scientific name", value: override.scientificName },
        { label: "Pronunciation", value: override.pronunciation },
        { label: "Diet", value: override.diet },
        { label: "Name meaning", value: override.nameMeaning },
        { label: "Length", value: override.length },
        { label: "Height", value: override.height },
        { label: "Weight", value: override.weight },
        { label: "Time period", value: override.timePeriod },
        { label: "Location", value: override.location },
        { label: "Taxon", value: override.taxon },
      ]
    : [
        { label: "Name", value: dinosaurName },
        { label: "Scientific name", value: toScientificName(dinosaurName) },
        { label: "Pronunciation", value: toPronunciation(dinosaurName) },
        { label: "Diet", value: toDiet(dinosaurName) },
        { label: "Name meaning", value: toNameMeaning(dinosaurName) },
        { label: "Length", value: formatMetersAsFeetThenMeters(dossier.lengthMeters) },
        { label: "Height", value: formatMetersAsFeetThenMeters(dossier.heightMeters) },
        { label: "Weight", value: toEstimatedWeight(dossier) },
        { label: "Time period", value: "Mesozoic Era (field estimate)" },
        { label: "Location", value: "Recovered from global fossil record sites" },
        { label: "Taxon", value: toTaxon(dossier) },
      ];

  return {
    description: override ? override.description : dossier.description,
    rows,
  };
}
