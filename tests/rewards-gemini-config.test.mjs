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

const rewardsGeminiModule = loadTypeScriptModule("src/features/rewards/lib/gemini.ts");

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
