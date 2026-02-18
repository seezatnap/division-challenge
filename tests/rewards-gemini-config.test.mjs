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

async function loadGeminiModule() {
  const dinosaursModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/dinosaurs.ts",
  );
  const dossiersModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/dino-dossiers.ts",
    {
      "./dinosaurs": dinosaursModuleUrl,
    },
  );
  const geminiModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/gemini.ts",
    {
      "./dino-dossiers": dossiersModuleUrl,
    },
  );

  return import(geminiModuleUrl);
}

const rewardsGeminiModule = loadGeminiModule();

test("createGeminiImageRequestConfig returns model + trimmed API key", async () => {
  const { createGeminiImageRequestConfig, GEMINI_IMAGE_MODEL_DEFAULT } =
    await rewardsGeminiModule;

  const config = createGeminiImageRequestConfig({
    GEMINI_API_KEY: "  secret-value  ",
  });

  assert.equal(config.apiKey, "secret-value");
  assert.equal(config.model, GEMINI_IMAGE_MODEL_DEFAULT);
});

test("createGeminiImageRequestConfig honors GEMINI_IMAGE_MODEL when provided", async () => {
  const { createGeminiImageRequestConfig } = await rewardsGeminiModule;

  const config = createGeminiImageRequestConfig({
    GEMINI_API_KEY: "secret-value",
    GEMINI_IMAGE_MODEL: "gemini-3-pro-image-preview",
  });

  assert.equal(config.model, "gemini-3-pro-image-preview");
});

test("getGeminiApiKey throws when GEMINI_API_KEY is missing", async () => {
  const { getGeminiApiKey } = await rewardsGeminiModule;

  assert.throws(
    () => getGeminiApiKey({}),
    /Missing GEMINI_API_KEY\. Set GEMINI_API_KEY in \.env\.local/,
  );
});

test("buildJurassicParkCinematicPrompt validates dinosaur input", async () => {
  const { buildJurassicParkCinematicPrompt } = await rewardsGeminiModule;

  assert.throws(
    () => buildJurassicParkCinematicPrompt("   "),
    /dinosaurName must be a non-empty string\./,
  );
});

test("buildJurassicParkCinematicPrompt includes reusable Jurassic cinematic guidance", async () => {
  const { buildJurassicParkCinematicPrompt } = await rewardsGeminiModule;

  const prompt = buildJurassicParkCinematicPrompt("Velociraptor");

  assert.match(prompt, /Velociraptor/);
  assert.match(prompt, /Jurassic Park inspired scene/);
  assert.match(prompt, /photorealistic cinematic still/);
  assert.match(prompt, /family-friendly/);
  assert.match(prompt, /no gore/);
});

test("buildRewardImagePrompt switches to amber-specific guidance for amber assets", async () => {
  const { buildRewardImagePrompt } = await rewardsGeminiModule;

  const prompt = buildRewardImagePrompt("Amber Resonance Crystal");

  assert.match(prompt, /Amber Resonance Crystal/);
  assert.match(prompt, /amber crystal/i);
  assert.match(prompt, /hero product still/i);
});

test("buildRewardImagePrompt switches to hybrid-specific guidance for hybrid assets", async () => {
  const { buildRewardImagePrompt } = await rewardsGeminiModule;

  const prompt = buildRewardImagePrompt("Hybrid Tyrannosaurus Rex + Velociraptor");

  assert.match(prompt, /Hybrid Tyrannosaurus Rex \+ Velociraptor/);
  assert.match(prompt, /dinosaur hybrid/i);
  assert.match(prompt, /family-friendly/i);
  assert.match(prompt, /Height: [\d.]+ m/);
  assert.match(prompt, /Length: [\d.]+ m/);
  assert.match(prompt, /Attributes:/);
  assert.match(prompt, /Description:/);
});

test("buildRewardImagePrompt includes dossier details for primary dinosaur assets", async () => {
  const { buildRewardImagePrompt } = await rewardsGeminiModule;

  const prompt = buildRewardImagePrompt("Brachiosaurus");

  assert.match(prompt, /Field dossier for Brachiosaurus/);
  assert.match(prompt, /Height: [\d.]+ m/);
  assert.match(prompt, /Length: [\d.]+ m/);
  assert.match(prompt, /Attributes:/);
  assert.match(prompt, /Description:/);
});
