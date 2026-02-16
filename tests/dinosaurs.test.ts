import assert from "node:assert/strict";
import test from "node:test";

import {
  DINOSAUR_NAMES,
  DINOSAUR_POOL_SIZE,
  assertValidDinosaurPool,
  hasExactDinosaurCount,
  hasUniqueDinosaurNames,
  isDinosaurName,
  selectDinosaurByRewardIndex,
  selectRandomDinosaur,
  selectRandomUnclaimedDinosaur,
} from "../lib/dinosaurs";

test("dinosaur pool exposes exactly 100 unique entries", () => {
  assert.equal(DINOSAUR_NAMES.length, DINOSAUR_POOL_SIZE);
  assert.equal(hasExactDinosaurCount(DINOSAUR_NAMES), true);
  assert.equal(hasUniqueDinosaurNames(DINOSAUR_NAMES), true);
  assert.doesNotThrow(() => assertValidDinosaurPool(DINOSAUR_NAMES));
});

test("dinosaur pool includes major Jurassic franchise species", () => {
  const majorSpecies = [
    "Tyrannosaurus Rex",
    "Velociraptor",
    "Triceratops",
    "Brachiosaurus",
    "Dilophosaurus",
    "Mosasaurus",
    "Indominus Rex",
    "Indoraptor",
    "Giganotosaurus",
    "Therizinosaurus",
    "Atrociraptor",
    "Pyroraptor",
    "Dimetrodon",
  ];
  const dinosaurSet = new Set<string>(DINOSAUR_NAMES);

  for (const species of majorSpecies) {
    assert.equal(dinosaurSet.has(species), true);
  }
});

test("guard helpers reject count and uniqueness violations", () => {
  const tooShortPool = DINOSAUR_NAMES.slice(0, DINOSAUR_POOL_SIZE - 1);

  assert.equal(hasExactDinosaurCount(tooShortPool), false);
  assert.equal(
    hasUniqueDinosaurNames(["Tyrannosaurus Rex", "  tyrannosaurus rex  "]),
    false,
  );

  assert.throws(
    () => assertValidDinosaurPool(tooShortPool),
    /must contain exactly/,
  );
  assert.throws(
    () =>
      assertValidDinosaurPool([
        ...DINOSAUR_NAMES.slice(0, DINOSAUR_POOL_SIZE - 1),
        DINOSAUR_NAMES[0],
      ]),
    /contains duplicate names/,
  );
});

test("isDinosaurName validates entries from the canonical pool", () => {
  assert.equal(isDinosaurName("Tyrannosaurus Rex"), true);
  assert.equal(isDinosaurName("  tyrannosaurus rex  "), true);
  assert.equal(isDinosaurName("Dragon"), false);
});

test("deterministic reward-index selection wraps at pool boundaries", () => {
  assert.equal(selectDinosaurByRewardIndex(0), DINOSAUR_NAMES[0]);
  assert.equal(
    selectDinosaurByRewardIndex(DINOSAUR_POOL_SIZE),
    DINOSAUR_NAMES[0],
  );
  assert.equal(selectDinosaurByRewardIndex(1), DINOSAUR_NAMES[1]);
  assert.throws(() => selectDinosaurByRewardIndex(-1), /non-negative integer/);
  assert.throws(
    () => selectDinosaurByRewardIndex(0, []),
    /empty dinosaur pool/,
  );
});

test("random selection utilities support deterministic test injection", () => {
  const samplePool = ["Tyrannosaurus Rex", "Velociraptor", "Triceratops"];

  assert.equal(selectRandomDinosaur(samplePool, () => 0), samplePool[0]);
  assert.equal(selectRandomDinosaur(samplePool, () => 0.5), samplePool[1]);
  assert.equal(selectRandomDinosaur(samplePool, () => 0.99), samplePool[2]);
  assert.throws(() => selectRandomDinosaur(samplePool, () => 1), /\[0, 1\)/);
  assert.throws(() => selectRandomDinosaur([], () => 0), /empty dinosaur pool/);
});

test("selectRandomUnclaimedDinosaur prioritizes species not yet unlocked", () => {
  const pool = ["Tyrannosaurus Rex", "Velociraptor", "Triceratops"];

  assert.equal(
    selectRandomUnclaimedDinosaur(
      ["  tyrannosaurus rex", "VELOCIRAPTOR "],
      pool,
      () => 0,
    ),
    "Triceratops",
  );

  assert.equal(
    selectRandomUnclaimedDinosaur(pool, pool, () => 0.5),
    "Velociraptor",
  );
});
