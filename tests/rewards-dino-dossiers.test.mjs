import assert from "node:assert/strict";
import test from "node:test";

import { loadTypeScriptModule } from "../scripts/lib/load-typescript-module.mjs";

const dossiersModule = loadTypeScriptModule("src/features/rewards/lib/dino-dossiers.ts");

test("primary dossier builder is deterministic and includes metrics + attributes", async () => {
  const { buildPrimaryDinosaurDossier } = await dossiersModule;

  const firstDossier = buildPrimaryDinosaurDossier("Velociraptor");
  const secondDossier = buildPrimaryDinosaurDossier("  velociraptor  ");

  assert.equal(firstDossier.subjectName, "Velociraptor");
  assert.equal(firstDossier.kind, "primary");
  assert.equal(firstDossier.heightMeters, secondDossier.heightMeters);
  assert.equal(firstDossier.lengthMeters, secondDossier.lengthMeters);
  assert.deepEqual(firstDossier.attributes, secondDossier.attributes);
  assert.ok(firstDossier.description.length > 0);
  assert.equal(firstDossier.attributes.length, 3);
});

test("hybrid dossier parsing and generation normalize pair order", async () => {
  const {
    buildHybridDinosaurDossier,
    buildHybridGenerationAssetName,
    parseHybridGenerationAssetName,
  } = await dossiersModule;

  const parsedPair = parseHybridGenerationAssetName(
    "Hybrid Velociraptor + Tyrannosaurus Rex",
  );
  assert.deepEqual(parsedPair, {
    firstDinosaurName: "Tyrannosaurus Rex",
    secondDinosaurName: "Velociraptor",
  });

  const hybridDossier = buildHybridDinosaurDossier({
    firstDinosaurName: "Velociraptor",
    secondDinosaurName: "Tyrannosaurus Rex",
  });
  assert.equal(
    hybridDossier.subjectName,
    buildHybridGenerationAssetName({
      firstDinosaurName: "Tyrannosaurus Rex",
      secondDinosaurName: "Velociraptor",
    }),
  );
  assert.equal(hybridDossier.kind, "hybrid");
  assert.equal(hybridDossier.sourceDinosaurs?.length, 2);
  assert.ok(hybridDossier.attributes.length >= 3);
});

test("resolveRewardAssetDossier ignores amber and formats dossier prompt blocks", async () => {
  const {
    formatRewardDossierPromptBlock,
    resolveRewardAssetDossier,
  } = await dossiersModule;

  assert.equal(resolveRewardAssetDossier("Amber Resonance Crystal"), null);

  const primaryDossier = resolveRewardAssetDossier("Triceratops");
  assert.ok(primaryDossier);

  const promptBlock = formatRewardDossierPromptBlock(primaryDossier);
  assert.match(promptBlock, /Field dossier for Triceratops/);
  assert.match(promptBlock, /Height:/);
  assert.match(promptBlock, /Length:/);
  assert.match(promptBlock, /Attributes:/);
  assert.match(promptBlock, /Description:/);
});
