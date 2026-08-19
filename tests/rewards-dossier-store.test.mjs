import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTypeScriptModule } from "../scripts/lib/load-typescript-module.mjs";

// Isolated database for this file (read lazily on the first query).
const databaseDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-dossier-store-db-"));
process.env.TURSO_DATABASE_URL = `file:${path.join(databaseDirectory, "dossiers.sqlite3")}`;

const modules = Promise.all([
  loadTypeScriptModule("src/features/rewards/lib/dossier-store.ts"),
  loadTypeScriptModule("src/features/rewards/lib/dino-dossiers.ts"),
]).then(([store, dossiers]) => ({ store, dossiers }));

function createGeneratedDossier(subjectName, description, attributes = []) {
  return {
    dossier: {
      kind: subjectName.startsWith("Hybrid") ? "hybrid" : "primary",
      subjectName,
      heightMeters: 99,
      lengthMeters: 99,
      attributes,
      description,
      sourceDinosaurs: null,
      infoCard: null,
    },
    model: "gpt-5.6-luna",
    prompt: "test prompt",
  };
}

test("ensureRewardDossier generates once, stores the prose, and reuses it", async () => {
  const { store } = await modules;
  let generationCount = 0;

  const first = await store.ensureRewardDossier("Triceratops", {
    generateDossier: async (assetName) => {
      generationCount += 1;
      return createGeneratedDossier(assetName, "A three-horned plant eater the size of a truck.");
    },
  });

  assert.equal(generationCount, 1);
  assert.equal(first.wasRegenerated, true);
  assert.equal(first.source, "openai");
  assert.equal(first.dossier.description, "A three-horned plant eater the size of a truck.");

  const second = await store.ensureRewardDossier("Triceratops", {
    generateDossier: async () => {
      throw new Error("stored prose should be reused instead of regenerating");
    },
  });

  assert.equal(generationCount, 1);
  assert.equal(second.wasRegenerated, false);
  assert.equal(second.dossier.description, first.dossier.description);
});

test("stored prose can never carry a fact — measurements always come from the fact sheet", async () => {
  const { store, dossiers } = await modules;

  const stored = await store.ensureRewardDossier("Stegosaurus", {
    generateDossier: async (assetName) =>
      createGeneratedDossier(assetName, "A plated Jurassic plant eater.", ["wrong", "made", "up"]),
  });

  const curated = dossiers.buildPrimaryDinosaurDossier("Stegosaurus");
  assert.equal(stored.dossier.lengthMeters, curated.lengthMeters);
  assert.equal(stored.dossier.heightMeters, curated.heightMeters);
  assert.deepEqual([...stored.dossier.attributes], [...curated.attributes]);
  assert.deepEqual(stored.dossier.infoCard, curated.infoCard);

  // The stored row itself holds no measurements at all.
  const row = await store.readStoredRewardDossier("Stegosaurus");
  assert.equal(row.description, "A plated Jurassic plant eater.");
  assert.equal("heightMeters" in row, false);
  assert.equal("lengthMeters" in row, false);
  assert.equal("infoCard" in row, false);
});

test("a failed generation degrades to curated prose without storing it", async () => {
  const { store, dossiers } = await modules;

  const resolution = await store.ensureRewardDossier("Ankylosaurus", {
    generateDossier: async () => {
      throw new Error("model unavailable");
    },
  });

  assert.equal(resolution.source, "curated");
  assert.equal(resolution.wasRegenerated, false);
  assert.equal(
    resolution.dossier.description,
    dossiers.buildPrimaryDinosaurDossier("Ankylosaurus").description,
  );
  assert.equal(await store.readStoredRewardDossier("Ankylosaurus"), null);
});

test("hybrids resolve to one canonical row whichever order they are named", async () => {
  const { store } = await modules;
  let generationCount = 0;

  const first = await store.ensureRewardDossier("Hybrid Velociraptor + Triceratops", {
    generateDossier: async (assetName) => {
      generationCount += 1;
      return createGeneratedDossier(assetName, "An imaginary blend of two very different animals.", [
        "spliced trait one",
        "spliced trait two",
        "spliced trait three",
      ]);
    },
  });

  assert.equal(first.dossier.kind, "hybrid");
  assert.equal(first.dossier.subjectName, "Hybrid Triceratops + Velociraptor");
  // Hybrids are fiction, so the model may supply their traits.
  assert.deepEqual([...first.dossier.attributes], [
    "spliced trait one",
    "spliced trait two",
    "spliced trait three",
  ]);
  // ...but their size is still the average of the two real parents.
  assert.equal(first.dossier.lengthMeters, 5.5);
  assert.equal(first.dossier.infoCard, null);

  const reversed = await store.ensureRewardDossier("Hybrid Triceratops + Velociraptor", {
    generateDossier: async () => {
      throw new Error("should reuse the row written under the normalized name");
    },
  });
  assert.equal(generationCount, 1);
  assert.equal(reversed.dossier.description, first.dossier.description);
});

test("getRewardDossier never calls the model and skips amber assets", async () => {
  const { store, dossiers } = await modules;

  const unseeded = await store.getRewardDossier("Gallimimus");
  assert.equal(unseeded.source, "curated");
  assert.equal(
    unseeded.dossier.description,
    dossiers.buildPrimaryDinosaurDossier("Gallimimus").description,
  );

  await store.saveRewardDossier({
    subjectName: "Gallimimus",
    kind: "primary",
    description: "An ostrich-shaped runner from Mongolia.",
    attributes: [],
    source: "gemini",
    model: "gemini-3-flash-preview",
    prompt: "legacy prompt",
  });

  const seeded = await store.getRewardDossier("Gallimimus");
  assert.equal(seeded.source, "gemini");
  assert.equal(seeded.dossier.description, "An ostrich-shaped runner from Mongolia.");

  assert.equal(await store.getRewardDossier("Amber Resonance Crystal"), null);
  assert.equal(await store.ensureRewardDossier("Amber Resonance Crystal"), null);
});

test("listStoredRewardDossiers returns what has been written", async () => {
  const { store } = await modules;

  const stored = await store.listStoredRewardDossiers();
  const subjectNames = stored.map((entry) => entry.subjectName);

  assert.ok(subjectNames.includes("Triceratops"));
  assert.ok(subjectNames.includes("Hybrid Triceratops + Velociraptor"));
  assert.ok(!subjectNames.includes("Ankylosaurus"), "failed generations must not be stored");
  for (const entry of stored) {
    assert.ok(entry.description.length > 0);
    assert.ok(["openai", "gemini", "curated"].includes(entry.source));
  }
});
