import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function transpileTypeScriptToDataUrl(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");

  const compiledSource = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;

  return `data:text/javascript;base64,${Buffer.from(compiledSource).toString("base64")}`;
}

const profileModule = (async () => {
  const profileModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/gallery/lib/research-center-profile.ts",
  );
  return import(profileModuleUrl);
})();

const samplePrimaryDossier = {
  kind: "primary",
  subjectName: "Brachiosaurus",
  heightMeters: 12,
  lengthMeters: 25,
  attributes: ["broad neck musculature", "long stride gait", "elevated posture"],
  description: "fallback profile copy",
  sourceDinosaurs: null,
};

test("Research Center profile includes the comp-matching Brachiosaurus data-sheet rows", async () => {
  const { buildResearchCenterDinosaurProfile } = await profileModule;
  const profile = buildResearchCenterDinosaurProfile("Brachiosaurus", samplePrimaryDossier);

  assert.deepEqual(
    profile.rows.map((row) => row.label),
    [
      "Name",
      "Scientific name",
      "Pronunciation",
      "Diet",
      "Name meaning",
      "Length",
      "Height",
      "Weight",
      "Time period",
      "Location",
      "Taxon",
    ],
  );

  const valueByLabel = Object.fromEntries(profile.rows.map((row) => [row.label, row.value]));
  assert.equal(valueByLabel.Name, "Brachiosaurus");
  assert.equal(valueByLabel["Scientific name"], "Brachiosaurus altithorax");
  assert.equal(valueByLabel.Pronunciation, "Bra - key - o - saw - rus");
  assert.equal(valueByLabel.Diet, "Herbivore (Plant-Eater)");
  assert.equal(valueByLabel["Name meaning"], "\"high chested arm reptile\"");
  assert.equal(valueByLabel.Length, "80 feet (25 m)");
  assert.equal(valueByLabel.Height, "40 feet (12 m)");
  assert.equal(valueByLabel.Weight, "60 tons (54,500 kilos)");
  assert.match(profile.description, /largest known dinosaur/i);
});

test("Research Center profile falls back to deterministic generated values for non-overrides", async () => {
  const { buildResearchCenterDinosaurProfile } = await profileModule;
  const tyrannosaurusProfile = buildResearchCenterDinosaurProfile("Tyrannosaurus Rex", {
    ...samplePrimaryDossier,
    subjectName: "Tyrannosaurus Rex",
    heightMeters: 7.9,
    lengthMeters: 12.7,
    description: "Apex predator profile generated from field records.",
  });

  const valueByLabel = Object.fromEntries(
    tyrannosaurusProfile.rows.map((row) => [row.label, row.value]),
  );

  assert.equal(valueByLabel.Name, "Tyrannosaurus Rex");
  assert.equal(valueByLabel["Scientific name"], "Tyrannosaurus rex");
  assert.equal(valueByLabel.Diet, "Carnivore");
  assert.match(valueByLabel.Length, /feet \(\d+ m\)/);
  assert.match(valueByLabel.Height, /feet \(\d+ m\)/);
  assert.match(valueByLabel.Weight, /tons \(\d[\d,]* kilos\)/);
  assert.equal(
    tyrannosaurusProfile.description,
    "Apex predator profile generated from field records.",
  );
});
