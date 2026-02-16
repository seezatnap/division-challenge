// ─── Dinosaur Constants & Utilities ──────────────────────────
//
// Static list of 100 dinosaurs used as the reward pool.
// Includes major Jurassic Park / Jurassic World / Camp Cretaceous /
// Chaos Theory species prominently.

/** The exact number of dinosaurs in the canonical pool. */
export const DINOSAUR_COUNT = 100 as const;

/**
 * The canonical list of 100 dinosaurs.
 * Order: franchise-prominent species first, then remaining species
 * alphabetically to fill the pool.
 */
export const DINOSAURS: readonly string[] = Object.freeze([
  // ── Jurassic Park / Jurassic World / Chaos Theory headliners ──
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
  // ── Supporting franchise species ──
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
  // ── Extended roster ──
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
  // ── Deep roster ──
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
]);

// ─── Guard checks ────────────────────────────────────────────

/**
 * Asserts at module-evaluation time that the DINOSAURS array contains
 * exactly DINOSAUR_COUNT entries and that every entry is unique.
 *
 * These are compile-time-style safeguards: if someone edits the list
 * and introduces a duplicate or changes the count, the app will crash
 * on startup with a clear message.
 */
function assertDinosaurListIntegrity(): void {
  if (DINOSAURS.length !== DINOSAUR_COUNT) {
    throw new Error(
      `Dinosaur list must contain exactly ${DINOSAUR_COUNT} entries, but has ${DINOSAURS.length}.`,
    );
  }

  const seen = new Set<string>();
  for (const name of DINOSAURS) {
    if (seen.has(name)) {
      throw new Error(`Duplicate dinosaur in list: "${name}".`);
    }
    seen.add(name);
  }
}

assertDinosaurListIntegrity();

// ─── Selection utilities ─────────────────────────────────────

/**
 * Return a dinosaur by its zero-based index in the canonical list.
 * Throws if the index is out of range.
 */
export function getDinosaurByIndex(index: number): string {
  if (!Number.isInteger(index) || index < 0 || index >= DINOSAUR_COUNT) {
    throw new RangeError(
      `Index must be an integer in [0, ${DINOSAUR_COUNT - 1}], got ${index}.`,
    );
  }
  return DINOSAURS[index];
}

/**
 * Return a random dinosaur name from the full list.
 */
export function getRandomDinosaur(): string {
  return DINOSAURS[Math.floor(Math.random() * DINOSAUR_COUNT)];
}

/**
 * Return a random dinosaur that has NOT already been unlocked.
 *
 * @param unlockedNames - set or array of dinosaur names the player already has.
 * @returns the chosen dinosaur name, or `null` if all 100 are unlocked.
 */
export function getNextUnlockedDinosaur(
  unlockedNames: ReadonlySet<string> | readonly string[],
): string | null {
  const unlocked =
    unlockedNames instanceof Set
      ? unlockedNames
      : new Set(unlockedNames);

  const available = DINOSAURS.filter((d) => !unlocked.has(d));
  if (available.length === 0) return null;

  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Check whether a given name is a valid dinosaur from the canonical list.
 */
export function isDinosaurName(name: string): boolean {
  return (DINOSAURS as readonly string[]).includes(name);
}
