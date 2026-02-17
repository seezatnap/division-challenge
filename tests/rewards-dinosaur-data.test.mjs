import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function loadTypeScriptModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const rewardsDinosaurModule = loadTypeScriptModule("src/features/rewards/lib/dinosaurs.ts");

const expectedDinosaurRoster = [
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
];

test("dinosaur roster exports the full static 100-item list in spec order", async () => {
  const { DINOSAUR_ROSTER, DINOSAUR_ROSTER_SIZE, EXPECTED_DINOSAUR_ROSTER_SIZE } =
    await rewardsDinosaurModule;

  assert.equal(DINOSAUR_ROSTER_SIZE, 100);
  assert.equal(DINOSAUR_ROSTER_SIZE, EXPECTED_DINOSAUR_ROSTER_SIZE);
  assert.deepEqual(DINOSAUR_ROSTER, expectedDinosaurRoster);
  assert.equal(new Set(DINOSAUR_ROSTER).size, DINOSAUR_ROSTER.length);
});

test("priority set is positioned at the front of the unlock roster", async () => {
  const { DINOSAUR_ROSTER, JP_JW_CHAOS_THEORY_PRIORITY_DINOSAURS } = await rewardsDinosaurModule;

  assert.deepEqual(
    DINOSAUR_ROSTER.slice(0, JP_JW_CHAOS_THEORY_PRIORITY_DINOSAURS.length),
    JP_JW_CHAOS_THEORY_PRIORITY_DINOSAURS,
  );
});

test("reward-number and milestone mapping remain deterministic", async () => {
  const { getRewardNumberForSolvedCount, getMilestoneSolvedCountForRewardNumber, REWARD_UNLOCK_INTERVAL } =
    await rewardsDinosaurModule;

  assert.equal(REWARD_UNLOCK_INTERVAL, 5);
  assert.equal(getRewardNumberForSolvedCount(0), 0);
  assert.equal(getRewardNumberForSolvedCount(4), 0);
  assert.equal(getRewardNumberForSolvedCount(5), 1);
  assert.equal(getRewardNumberForSolvedCount(29), 5);
  assert.equal(getRewardNumberForSolvedCount(30), 6);

  assert.equal(getMilestoneSolvedCountForRewardNumber(1), 5);
  assert.equal(getMilestoneSolvedCountForRewardNumber(6), 30);
});

test("dinosaur selection by reward number wraps without changing deterministic order", async () => {
  const { getDinosaurForRewardNumber } = await rewardsDinosaurModule;

  assert.equal(getDinosaurForRewardNumber(1), "Tyrannosaurus Rex");
  assert.equal(getDinosaurForRewardNumber(100), "Erythrovenator");
  assert.equal(getDinosaurForRewardNumber(101), "Tyrannosaurus Rex");
  assert.equal(getDinosaurForRewardNumber(102), "Velociraptor");
});

test("recent and next unlock helpers map solved and unlocked counts consistently", async () => {
  const { getMostRecentUnlockedDinosaur, getNextDinosaurToUnlock } = await rewardsDinosaurModule;

  assert.equal(getMostRecentUnlockedDinosaur(0), null);
  assert.equal(getMostRecentUnlockedDinosaur(4), null);
  assert.equal(getMostRecentUnlockedDinosaur(5), "Tyrannosaurus Rex");
  assert.equal(getMostRecentUnlockedDinosaur(9), "Tyrannosaurus Rex");
  assert.equal(getMostRecentUnlockedDinosaur(10), "Velociraptor");

  assert.equal(getNextDinosaurToUnlock(0), "Tyrannosaurus Rex");
  assert.equal(getNextDinosaurToUnlock(1), "Velociraptor");
  assert.equal(getNextDinosaurToUnlock(100), "Tyrannosaurus Rex");
});

test("deterministic unlock order helper supports stable slices across roster boundaries", async () => {
  const { getDeterministicUnlockOrder } = await rewardsDinosaurModule;

  assert.deepEqual(getDeterministicUnlockOrder(1, 3), [
    "Tyrannosaurus Rex",
    "Velociraptor",
    "Triceratops",
  ]);

  assert.deepEqual(getDeterministicUnlockOrder(98, 4), [
    "Bagualosaurus",
    "Nhandumirim",
    "Erythrovenator",
    "Tyrannosaurus Rex",
  ]);

  assert.deepEqual(getDeterministicUnlockOrder(25, 0), []);
});

test("selection utilities reject invalid numeric input", async () => {
  const {
    getRewardNumberForSolvedCount,
    getMilestoneSolvedCountForRewardNumber,
    getDinosaurForRewardNumber,
    getNextDinosaurToUnlock,
    getDeterministicUnlockOrder,
  } = await rewardsDinosaurModule;

  assert.throws(() => getRewardNumberForSolvedCount(-1), /solvedProblems must be a non-negative integer/);
  assert.throws(() => getRewardNumberForSolvedCount(10, 0), /unlockInterval must be a positive integer/);
  assert.throws(() => getMilestoneSolvedCountForRewardNumber(0), /rewardNumber must be a positive integer/);
  assert.throws(() => getDinosaurForRewardNumber(0), /rewardNumber must be a positive integer/);
  assert.throws(() => getNextDinosaurToUnlock(-1), /unlockedRewardsCount must be a non-negative integer/);
  assert.throws(() => getDeterministicUnlockOrder(0, 1), /startRewardNumber must be a positive integer/);
  assert.throws(() => getDeterministicUnlockOrder(1, -1), /count must be a non-negative integer/);
});
