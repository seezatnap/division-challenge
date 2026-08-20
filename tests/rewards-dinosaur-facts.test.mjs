import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { loadTypeScriptModule, repoRoot } from "../scripts/lib/load-typescript-module.mjs";

const modules = Promise.all([
  loadTypeScriptModule("src/features/rewards/lib/dinosaur-facts.ts"),
  loadTypeScriptModule("src/features/rewards/lib/dinosaurs.ts"),
  loadTypeScriptModule("src/features/rewards/lib/dino-dossiers.ts"),
]).then(([facts, dinosaurs, dossiers]) => ({ facts, dinosaurs, dossiers }));

test("every roster entry has a curated fact sheet", async () => {
  const { facts, dinosaurs } = await modules;

  const missing = dinosaurs.DINOSAUR_ROSTER.filter(
    (name) => facts.getDinosaurFactSheet(name) === null,
  );
  assert.deepEqual(missing, [], `Roster entries without curated facts: ${missing.join(", ")}`);
  assert.equal(Object.keys(facts.DINOSAUR_FACT_SHEETS).length, dinosaurs.DINOSAUR_ROSTER.length);
});

test("fact sheets are internally consistent", async () => {
  const { facts, dinosaurs } = await modules;
  const problems = [];

  for (const name of dinosaurs.DINOSAUR_ROSTER) {
    const sheet = facts.getDinosaurFactSheet(name);
    const genus = name.split(/\s+/)[0];

    // The genus must match the roster key unless the mismatch is deliberately
    // documented (the roster contains one legacy misspelling).
    if (!sheet.scientificName.startsWith(genus) && !sheet.rosterNameNote) {
      problems.push(`${name}: scientificName "${sheet.scientificName}" does not start with "${genus}"`);
    }
    for (const field of ["pronunciation", "nameMeaning", "location", "taxon", "period", "description"]) {
      if (typeof sheet[field] !== "string" || sheet[field].trim().length === 0) {
        problems.push(`${name}: ${field} is empty`);
      }
    }
    for (const field of ["lengthMeters", "heightMeters", "weightKg"]) {
      if (!(typeof sheet[field] === "number" && sheet[field] > 0)) {
        problems.push(`${name}: ${field} must be a positive number`);
      }
    }
    if (sheet.heightMeters > sheet.lengthMeters) {
      problems.push(`${name}: height (${sheet.heightMeters}) exceeds length (${sheet.lengthMeters})`);
    }
    if (sheet.group === "film-creation") {
      if (sheet.startMya !== 0 || sheet.endMya !== 0) {
        problems.push(`${name}: fictional creatures must not carry a geologic age`);
      }
    } else if (!(sheet.startMya >= sheet.endMya && sheet.endMya >= 0 && sheet.startMya <= 4000)) {
      problems.push(`${name}: implausible age range ${sheet.startMya}–${sheet.endMya} mya`);
    }
    if (sheet.traits.length !== 3 || sheet.traits.some((trait) => trait.trim().length === 0)) {
      problems.push(`${name}: expected three non-empty traits`);
    }
    // Two sentences of real prose, not a template.
    if (sheet.description.length < 80) {
      problems.push(`${name}: description is suspiciously short`);
    }
  }

  assert.deepEqual(problems, [], problems.join("\n"));
});

test("descriptions are individually written, not generated from one template", async () => {
  const { facts, dinosaurs } = await modules;

  const descriptions = dinosaurs.DINOSAUR_ROSTER.map(
    (name) => facts.getDinosaurFactSheet(name).description,
  );
  assert.equal(new Set(descriptions).size, descriptions.length, "duplicate descriptions found");

  // The old generator emitted this phrasing for every single animal.
  const templated = descriptions.filter((text) => /is profiled as a high-alert apex-era species/.test(text));
  assert.deepEqual(templated, []);
});

test("non-dinosaurs and film creations are labelled honestly", async () => {
  const { facts } = await modules;

  const pteranodon = facts.getDinosaurFactSheet("Pteranodon");
  assert.equal(pteranodon.group, "pterosaur");
  assert.match(facts.formatTaxonForDisplay(pteranodon), /not a dinosaur/);

  const dimetrodon = facts.getDinosaurFactSheet("Dimetrodon");
  assert.equal(dimetrodon.group, "synapsid");
  assert.equal(dimetrodon.period, "Early Permian");
  assert.match(facts.formatTaxonForDisplay(dimetrodon), /not a dinosaur/);

  const mosasaurus = facts.getDinosaurFactSheet("Mosasaurus");
  assert.equal(mosasaurus.group, "marine-reptile");

  const indominus = facts.getDinosaurFactSheet("Indominus Rex");
  assert.equal(indominus.group, "film-creation");
  assert.equal(facts.isRealAnimal(indominus), false);
  assert.match(facts.formatTimePeriodForDisplay(indominus), /engineered by InGen/);
  assert.doesNotMatch(facts.formatTimePeriodForDisplay(indominus), /million years ago/);
});

test("info card fields come from the curated sheet (regression: Brachiosaurus)", async () => {
  const { dossiers } = await modules;

  const dossier = dossiers.buildPrimaryDinosaurDossier("Brachiosaurus");
  const { infoCard } = dossier;

  // Every one of these was wrong when the card was generated from hashed pools.
  assert.equal(infoCard.scientificName, "Brachiosaurus altithorax");
  assert.equal(infoCard.diet, "Herbivore (Plant-Eater)");
  assert.equal(infoCard.nameMeaning, '"arm lizard"');
  assert.match(infoCard.timePeriod, /^Late Jurassic —/);
  assert.match(infoCard.taxon, /Sauropoda/);
  assert.doesNotMatch(infoCard.taxon, /Dromaeosauridae|Theropoda/);
  assert.equal(infoCard.location, "Western United States");
  assert.ok(infoCard.weightKg >= 25000, `expected a sauropod-sized weight, got ${infoCard.weightKg}`);
  assert.match(infoCard.pronunciation, /BRAK/);
  assert.equal(dossier.lengthMeters, 21);
  assert.equal(dossier.heightMeters, 12);
});

test("dossier facts are deterministic and match the fact sheet for every roster entry", async () => {
  const { facts, dinosaurs, dossiers } = await modules;

  for (const name of dinosaurs.DINOSAUR_ROSTER) {
    const sheet = facts.getDinosaurFactSheet(name);
    const dossier = dossiers.buildPrimaryDinosaurDossier(name);

    assert.equal(dossier.lengthMeters, sheet.lengthMeters, name);
    assert.equal(dossier.heightMeters, sheet.heightMeters, name);
    assert.equal(dossier.description, sheet.description, name);
    assert.deepEqual([...dossier.attributes], [...sheet.traits], name);
    assert.equal(dossier.infoCard.weightKg, sheet.weightKg, name);
    assert.deepEqual(dossier, dossiers.buildPrimaryDinosaurDossier(` ${name.toLowerCase()} `), name);
  }
});

test("stored dossier content can never override curated facts", async () => {
  const { dossiers } = await modules;

  const parsed = dossiers.parseRewardDinosaurDossierArtifact({
    kind: "primary",
    subjectName: "Brachiosaurus",
    dimensions: { heightMeters: 6.2, lengthMeters: 12.3 },
    attributes: ["efficient oxygen recovery", "silent fern-canopy stalking"],
    description: "A model-written description that should survive.",
    infoCard: {
      scientificName: "Brachiosaurus saharicus",
      pronunciation: "Bra - Chi - Osa - Urus",
      diet: "Carnivore (Meat-Eater)",
      nameMeaning: '"roofed lizard"',
      weightKg: 3502,
      timePeriod: "Late Triassic - 230 to 210 million years ago",
      location: "North America, Europe",
      taxon: "Theropoda, Dromaeosauridae",
    },
  });

  // Prose is kept, every fact is replaced.
  assert.equal(parsed.description, "A model-written description that should survive.");
  assert.equal(parsed.infoCard.diet, "Herbivore (Plant-Eater)");
  assert.equal(parsed.infoCard.scientificName, "Brachiosaurus altithorax");
  assert.equal(parsed.infoCard.weightKg, 35000);
  assert.match(parsed.infoCard.timePeriod, /Late Jurassic/);
  assert.equal(parsed.lengthMeters, 21);
  assert.deepEqual([...parsed.attributes], ["front legs longer than back legs", "giraffe-like upright neck", "high-canopy browser"]);
});

test("hybrids are framed as lab creations and average their real parents", async () => {
  const { dossiers } = await modules;

  const hybrid = dossiers.buildHybridDinosaurDossier({
    firstDinosaurName: "Triceratops",
    secondDinosaurName: "Velociraptor",
  });

  assert.equal(hybrid.infoCard, null);
  assert.match(hybrid.description, /Engineered in the InGen DNA lab/);
  assert.doesNotMatch(hybrid.description, /imaginary|not a real animal/i);
  assert.equal(hybrid.lengthMeters, 5.5, "average of 9 m and 2 m");
  assert.equal(hybrid.heightMeters, 1.8, "average of 3 m and 0.5 m");
  assert.deepEqual(
    hybrid,
    dossiers.buildHybridDinosaurDossier({
      firstDinosaurName: "Velociraptor",
      secondDinosaurName: "Triceratops",
    }),
  );
});

test("an unknown subject reports missing data instead of inventing it", async () => {
  const { dossiers } = await modules;

  const dossier = dossiers.buildPrimaryDinosaurDossier("Fakeosaurus");
  assert.equal(dossier.infoCard, null);
  assert.equal(dossier.lengthMeters, 0);
  assert.equal(dossier.heightMeters, 0);
  assert.deepEqual(dossier.attributes, []);
  assert.match(dossier.description, /not in the Research Center catalogue/);
});

test("the prompt block carries curated ground truth to the models", async () => {
  const { dossiers } = await modules;

  const block = dossiers.formatRewardDossierPromptBlock(
    dossiers.buildPrimaryDinosaurDossier("Velociraptor"),
  );
  assert.match(block, /Scientific name: Velociraptor mongoliensis\./);
  assert.match(block, /Diet: Carnivore \(Meat-Eater\)\./);
  assert.match(block, /Lived: Late Cretaceous — 75 to 71 million years ago\./);
  assert.match(block, /Found in: Mongolia and northern China\./);
  assert.match(block, /covered in feathers/);
  assert.match(block, /Weight: 15 kg/);
});

test("the fake fact generators are gone from the source", async () => {
  const source = await readFile(
    path.join(repoRoot, "src/features/rewards/lib/dino-dossiers.ts"),
    "utf8",
  );

  for (const removedSymbol of [
    "DIET_POOL",
    "TIME_PERIOD_POOL",
    "LOCATION_POOL",
    "TAXON_POOL",
    "NAME_MEANING_POOL",
    "SPECIES_SUFFIXES",
    "ATTRIBUTE_POOL",
    "buildInfoCardPronunciation",
    "buildInfoCardScientificName",
    "pickDistinctAttributes",
  ]) {
    assert.ok(
      !source.includes(removedSymbol),
      `${removedSymbol} still present — info card facts must come from dinosaur-facts.ts`,
    );
  }
});
