// ---------------------------------------------------------------------------
// Dinosaur Constants & Selection Utilities
// ---------------------------------------------------------------------------
// Full static list of 100 dinosaurs, including the JP/JW/Chaos Theory
// priority set. Selection utilities provide deterministic unlock order
// based on milestone number.
// ---------------------------------------------------------------------------

/** Metadata for a single dinosaur in the roster. */
export interface DinosaurEntry {
  /** Display name of the dinosaur. */
  name: string;
  /** Whether this dinosaur is from the JP/JW/Chaos Theory franchise priority set. */
  isPriority: boolean;
}

/**
 * The JP/JW/Chaos Theory priority dinosaurs. These are unlocked first
 * (milestones 1–50) in the order listed below.
 */
const PRIORITY_DINOSAURS: readonly string[] = [
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
] as const;

/**
 * Non-priority dinosaurs. These are unlocked after all priority dinosaurs
 * (milestones 51–100) in the order listed below.
 */
const NON_PRIORITY_DINOSAURS: readonly string[] = [
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

/**
 * Complete roster of 100 dinosaurs with metadata.
 * Priority dinosaurs come first (indices 0–49), followed by non-priority (50–99).
 * The array order defines the deterministic unlock sequence.
 */
export const DINOSAUR_ROSTER: readonly DinosaurEntry[] = [
  ...PRIORITY_DINOSAURS.map((name) => ({ name, isPriority: true })),
  ...NON_PRIORITY_DINOSAURS.map((name) => ({ name, isPriority: false })),
] as const;

/** Total number of dinosaurs in the roster. */
export const TOTAL_DINOSAURS = 100;

/** Number of problems to solve per dinosaur reward milestone. */
export const PROBLEMS_PER_MILESTONE = 5;

// ---------------------------------------------------------------------------
// Selection Utilities
// ---------------------------------------------------------------------------

/**
 * Returns the dinosaur entry for a given milestone number (1-based).
 *
 * Milestone 1 → first dinosaur (T. Rex), milestone 2 → second, etc.
 * The unlock order is fully deterministic: priority dinosaurs first,
 * then non-priority, in the exact array order.
 *
 * @param milestoneNumber - 1-based milestone (1 = 5 problems solved, 2 = 10, etc.)
 * @returns The dinosaur entry, or `undefined` if milestone exceeds the roster.
 */
export function getDinosaurForMilestone(
  milestoneNumber: number
): DinosaurEntry | undefined {
  if (
    !Number.isInteger(milestoneNumber) ||
    milestoneNumber < 1 ||
    milestoneNumber > TOTAL_DINOSAURS
  ) {
    return undefined;
  }
  return DINOSAUR_ROSTER[milestoneNumber - 1];
}

/**
 * Returns the milestone number at which a given dinosaur is unlocked.
 *
 * @param dinoName - The dinosaur name to look up (case-sensitive).
 * @returns The 1-based milestone number, or `undefined` if the name is not in the roster.
 */
export function getMilestoneForDinosaur(
  dinoName: string
): number | undefined {
  const index = DINOSAUR_ROSTER.findIndex((entry) => entry.name === dinoName);
  return index === -1 ? undefined : index + 1;
}

/**
 * Computes the milestone number from the total number of problems solved.
 *
 * @param problemsSolved - Total problems solved (lifetime).
 * @returns The milestone number (0 if fewer than 5 solved).
 */
export function milestoneFromProblemsSolved(problemsSolved: number): number {
  if (problemsSolved < 0) return 0;
  return Math.floor(problemsSolved / PROBLEMS_PER_MILESTONE);
}

/**
 * Returns the dinosaur that should be unlocked for a given total problems-solved count.
 * Combines `milestoneFromProblemsSolved` and `getDinosaurForMilestone`.
 *
 * @param problemsSolved - Total problems solved (lifetime).
 * @returns The dinosaur entry, or `undefined` if the milestone exceeds the roster or is 0.
 */
export function getDinosaurForProblemsSolved(
  problemsSolved: number
): DinosaurEntry | undefined {
  const milestone = milestoneFromProblemsSolved(problemsSolved);
  return getDinosaurForMilestone(milestone);
}

/**
 * Returns true if the given problems-solved count has reached a new milestone
 * (i.e., is exactly divisible by PROBLEMS_PER_MILESTONE and > 0).
 *
 * @param problemsSolved - Total problems solved (lifetime).
 */
export function isRewardMilestone(problemsSolved: number): boolean {
  return (
    problemsSolved > 0 && problemsSolved % PROBLEMS_PER_MILESTONE === 0
  );
}

/**
 * Returns the next milestone number after the given problems-solved count,
 * or `undefined` if all milestones have been reached.
 *
 * @param problemsSolved - Total problems solved (lifetime).
 */
export function getNextMilestone(
  problemsSolved: number
): number | undefined {
  const currentMilestone = milestoneFromProblemsSolved(problemsSolved);
  const nextMilestone = currentMilestone + 1;
  return nextMilestone <= TOTAL_DINOSAURS ? nextMilestone : undefined;
}

/**
 * Returns all dinosaur names as a flat array (convenience accessor).
 */
export function getAllDinosaurNames(): string[] {
  return DINOSAUR_ROSTER.map((entry) => entry.name);
}

/**
 * Returns only the priority (JP/JW/Chaos Theory) dinosaur names.
 */
export function getPriorityDinosaurNames(): string[] {
  return DINOSAUR_ROSTER.filter((entry) => entry.isPriority).map(
    (entry) => entry.name
  );
}

/**
 * Returns only the non-priority dinosaur names.
 */
export function getNonPriorityDinosaurNames(): string[] {
  return DINOSAUR_ROSTER.filter((entry) => !entry.isPriority).map(
    (entry) => entry.name
  );
}
