import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

function toDataUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function transpileTypeScriptToDataUrl(relativePath, replacements = {}) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");

  let compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;

  for (const [specifier, replacement] of Object.entries(replacements)) {
    compiled = compiled.replaceAll(`from "${specifier}"`, `from "${replacement}"`);
    compiled = compiled.replaceAll(`from '${specifier}'`, `from "${replacement}"`);
  }

  return toDataUrl(compiled);
}

async function loadDinoDossiersModule() {
  const dinosaursModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/dinosaurs.ts",
  );
  const dossiersModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/dino-dossiers.ts",
    {
      "./dinosaurs": dinosaursModuleUrl,
    },
  );

  return import(dossiersModuleUrl);
}

const dossiersModule = loadDinoDossiersModule();

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
