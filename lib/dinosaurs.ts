export const DINOSAUR_POOL_SIZE = 100;

export const DINOSAUR_NAMES = [
  "Tyrannosaurus Rex",
  "Velociraptor",
  "Triceratops",
  "Brachiosaurus",
  "Dilophosaurus",
  "Spinosaurus",
  "Stegosaurus",
  "Parasaurolophus",
  "Gallimimus",
  "Compsognathus",
  "Pteranodon",
  "Mosasaurus",
  "Indominus Rex",
  "Indoraptor",
  "Giganotosaurus",
  "Therizinosaurus",
  "Atrociraptor",
  "Pyroraptor",
  "Dimetrodon",
  "Sinoceratops",
  "Allosaurus",
  "Carnotaurus",
  "Baryonyx",
  "Ankylosaurus",
  "Pachycephalosaurus",
  "Dimorphodon",
  "Nasutoceratops",
  "Quetzalcoatlus",
  "Dreadnoughtus",
  "Oviraptor",
  "Corythosaurus",
  "Ceratosaurus",
  "Suchomimus",
  "Mamenchisaurus",
  "Metriacanthosaurus",
  "Edmontosaurus",
  "Microceratus",
  "Apatosaurus",
  "Stigimoloch",
  "Monolophosaurus",
  "Lystrosaurus",
  "Moros intrepidus",
  "Iguanodon",
  "Kentrosaurus",
  "Proceratosaurus",
  "Segisaurus",
  "Herrerasaurus",
  "Majungasaurus",
  "Concavenator",
  "Acrocanthosaurus",
  "Carcharodontosaurus",
  "Pachyrhinosaurus",
  "Albertosaurus",
  "Deinonychus",
  "Utahraptor",
  "Plateosaurus",
  "Coelophysis",
  "Ornithomimus",
  "Struthiomimus",
  "Hadrosaurus",
  "Lambeosaurus",
  "Maiasaura",
  "Protoceratops",
  "Amargasaurus",
  "Nigersaurus",
  "Dsungaripterus",
  "Tupandactylus",
  "Nothosaurus",
  "Plesiosaurus",
  "Ichthyosaurus",
  "Sarcosuchus",
  "Deinosuchus",
  "Kaprosuchus",
  "Megalosaurus",
  "Rajasaurus",
  "Irritator",
  "Gigantoraptor",
  "Europasaurus",
  "Scolosaurus",
  "Minmi",
  "Sauropelta",
  "Nodosaurus",
  "Polacanthus",
  "Gastonia",
  "Crichtonsaurus",
  "Mussaurus",
  "Lesothosaurus",
  "Scutellosaurus",
  "Pisanosaurus",
  "Eoraptor",
  "Chromogisaurus",
  "Panphagia",
  "Saturnalia",
  "Guaibasaurus",
  "Staurikosaurus",
  "Buriolestes",
  "Gnathovorax",
  "Bagualosaurus",
  "Nhandumirim",
  "Erythrovenator",
] as const;

export type DinosaurName = (typeof DINOSAUR_NAMES)[number];

const normalizedDinosaurNameSet: ReadonlySet<string> = new Set(
  DINOSAUR_NAMES.map((name) => normalizeDinosaurName(name)),
);

function normalizeDinosaurName(name: string): string {
  return name.trim().toLowerCase();
}

function hasOnlyNonEmptyDinosaurNames(dinosaurs: readonly string[]): boolean {
  return dinosaurs.every((name) => name.trim().length > 0);
}

function assertNonEmptyPool(dinosaurs: readonly string[]): void {
  if (dinosaurs.length === 0) {
    throw new Error("Cannot select from an empty dinosaur pool.");
  }
}

function selectRandomIndex(length: number, random: () => number): number {
  const randomValue = random();

  if (
    !Number.isFinite(randomValue) ||
    randomValue < 0 ||
    randomValue >= 1
  ) {
    throw new Error("Random selector must return a value in the range [0, 1).");
  }

  return Math.floor(randomValue * length);
}

export function hasExactDinosaurCount(
  dinosaurs: readonly string[],
  expectedCount: number = DINOSAUR_POOL_SIZE,
): boolean {
  return dinosaurs.length === expectedCount;
}

export function hasUniqueDinosaurNames(dinosaurs: readonly string[]): boolean {
  const normalizedNames = dinosaurs.map((name) => normalizeDinosaurName(name));
  return new Set(normalizedNames).size === dinosaurs.length;
}

export function assertValidDinosaurPool(
  dinosaurs: readonly string[],
  expectedCount: number = DINOSAUR_POOL_SIZE,
): void {
  if (!hasExactDinosaurCount(dinosaurs, expectedCount)) {
    throw new Error(
      `Dinosaur pool must contain exactly ${expectedCount} entries, received ${dinosaurs.length}.`,
    );
  }

  if (!hasUniqueDinosaurNames(dinosaurs)) {
    throw new Error("Dinosaur pool contains duplicate names.");
  }

  if (!hasOnlyNonEmptyDinosaurNames(dinosaurs)) {
    throw new Error("Dinosaur pool contains blank names.");
  }
}

export function isDinosaurName(value: unknown): value is DinosaurName {
  return (
    typeof value === "string" &&
    normalizedDinosaurNameSet.has(normalizeDinosaurName(value))
  );
}

export function selectDinosaurByRewardIndex(
  rewardIndex: number,
  dinosaurs: readonly string[] = DINOSAUR_NAMES,
): string {
  if (!Number.isInteger(rewardIndex) || rewardIndex < 0) {
    throw new Error("Reward index must be a non-negative integer.");
  }

  assertNonEmptyPool(dinosaurs);
  return dinosaurs[rewardIndex % dinosaurs.length];
}

export function selectRandomDinosaur(
  dinosaurs: readonly string[] = DINOSAUR_NAMES,
  random: () => number = Math.random,
): string {
  assertNonEmptyPool(dinosaurs);
  const randomIndex = selectRandomIndex(dinosaurs.length, random);
  return dinosaurs[randomIndex];
}

export function selectRandomUnclaimedDinosaur(
  unlockedDinosaurs: readonly string[],
  dinosaurs: readonly string[] = DINOSAUR_NAMES,
  random: () => number = Math.random,
): string {
  const unlockedSet = new Set(
    unlockedDinosaurs.map((name) => normalizeDinosaurName(name)),
  );
  const availableDinosaurs = dinosaurs.filter(
    (name) => !unlockedSet.has(normalizeDinosaurName(name)),
  );
  const selectionPool =
    availableDinosaurs.length > 0 ? availableDinosaurs : dinosaurs;

  return selectRandomDinosaur(selectionPool, random);
}

assertValidDinosaurPool(DINOSAUR_NAMES);
