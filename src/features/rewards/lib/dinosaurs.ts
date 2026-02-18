export const REWARD_UNLOCK_INTERVAL = 5 as const;
export const EXPECTED_DINOSAUR_ROSTER_SIZE = 100 as const;

export const JP_JW_CHAOS_THEORY_PRIORITY_DINOSAURS = [
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
] as const;

const EXTENDED_DINOSAUR_ROSTER = [
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

export const DINOSAUR_ROSTER = [
  ...JP_JW_CHAOS_THEORY_PRIORITY_DINOSAURS,
  ...EXTENDED_DINOSAUR_ROSTER,
] as const;

export type DinosaurName = (typeof DINOSAUR_ROSTER)[number];

export const DINOSAUR_ROSTER_SIZE = DINOSAUR_ROSTER.length;

const dinosaurRosterSet = new Set<string>(DINOSAUR_ROSTER);

if (DINOSAUR_ROSTER_SIZE !== EXPECTED_DINOSAUR_ROSTER_SIZE) {
  throw new Error(
    `Expected ${EXPECTED_DINOSAUR_ROSTER_SIZE} dinosaurs but found ${DINOSAUR_ROSTER_SIZE}.`,
  );
}

if (dinosaurRosterSet.size !== DINOSAUR_ROSTER_SIZE) {
  throw new Error("DINOSAUR_ROSTER contains duplicate dinosaur names.");
}

function assertNonNegativeInteger(value: number, argumentName: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${argumentName} must be a non-negative integer.`);
  }
}

function assertPositiveInteger(value: number, argumentName: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${argumentName} must be a positive integer.`);
  }
}

export function getRewardNumberForSolvedCount(
  solvedProblems: number,
  unlockInterval: number = REWARD_UNLOCK_INTERVAL,
): number {
  assertNonNegativeInteger(solvedProblems, "solvedProblems");
  assertPositiveInteger(unlockInterval, "unlockInterval");

  return Math.floor(solvedProblems / unlockInterval);
}

export function getMilestoneSolvedCountForRewardNumber(
  rewardNumber: number,
  unlockInterval: number = REWARD_UNLOCK_INTERVAL,
): number {
  assertPositiveInteger(rewardNumber, "rewardNumber");
  assertPositiveInteger(unlockInterval, "unlockInterval");

  return rewardNumber * unlockInterval;
}

export function getDinosaurForRewardNumber(rewardNumber: number): DinosaurName {
  assertPositiveInteger(rewardNumber, "rewardNumber");

  const rosterIndex = (rewardNumber - 1) % DINOSAUR_ROSTER_SIZE;
  return DINOSAUR_ROSTER[rosterIndex];
}

export function getMostRecentUnlockedDinosaur(
  solvedProblems: number,
  unlockInterval: number = REWARD_UNLOCK_INTERVAL,
): DinosaurName | null {
  const rewardNumber = getRewardNumberForSolvedCount(solvedProblems, unlockInterval);

  if (rewardNumber === 0) {
    return null;
  }

  return getDinosaurForRewardNumber(rewardNumber);
}

export function getNextDinosaurToUnlock(unlockedRewardsCount: number): DinosaurName {
  assertNonNegativeInteger(unlockedRewardsCount, "unlockedRewardsCount");

  const rosterIndex = unlockedRewardsCount % DINOSAUR_ROSTER_SIZE;
  return DINOSAUR_ROSTER[rosterIndex];
}

export function getDeterministicUnlockOrder(
  startRewardNumber: number,
  count: number,
): readonly DinosaurName[] {
  assertPositiveInteger(startRewardNumber, "startRewardNumber");
  assertNonNegativeInteger(count, "count");

  return Array.from({ length: count }, (_, offset) =>
    getDinosaurForRewardNumber(startRewardNumber + offset),
  );
}
