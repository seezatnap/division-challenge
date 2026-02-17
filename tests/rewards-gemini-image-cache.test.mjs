import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import os from "node:os";
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

function createGeminiImage(dinosaurName, overrides = {}) {
  return {
    dinosaurName,
    prompt: `cinematic portrait of ${dinosaurName}`,
    model: "gemini-2.0-flash-exp",
    mimeType: "image/png",
    imageBase64: Buffer.from(`${dinosaurName}-bytes`).toString("base64"),
    ...overrides,
  };
}

const geminiImageCacheModule = loadTypeScriptModule(
  "src/features/rewards/lib/gemini-image-cache.ts",
);

test("resolveGeminiRewardImageWithFilesystemCache persists new images and marks disk existence", async () => {
  const {
    doesRewardImageExistOnDisk,
    readCachedGeminiRewardImage,
    resolveGeminiRewardImageWithFilesystemCache,
  } = await geminiImageCacheModule;

  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const generatedImage = createGeminiImage("Triceratops");
  let generatorInvocationCount = 0;

  const result = await resolveGeminiRewardImageWithFilesystemCache(
    { dinosaurName: " Triceratops " },
    async (request) => {
      generatorInvocationCount += 1;
      assert.equal(request.dinosaurName, "Triceratops");
      return generatedImage;
    },
    { outputDirectory: cacheDirectory },
  );

  assert.equal(generatorInvocationCount, 1);
  assert.deepEqual(result, generatedImage);
  assert.equal(
    await doesRewardImageExistOnDisk("Triceratops", { outputDirectory: cacheDirectory }),
    true,
  );

  const cachedImage = await readCachedGeminiRewardImage("Triceratops", {
    outputDirectory: cacheDirectory,
  });
  assert.deepEqual(cachedImage, generatedImage);
});

test("resolveGeminiRewardImageWithFilesystemCache skips duplicate generation when cached asset exists", async () => {
  const { resolveGeminiRewardImageWithFilesystemCache } = await geminiImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const generatedImage = createGeminiImage("Velociraptor");
  let generatorInvocationCount = 0;

  const firstResult = await resolveGeminiRewardImageWithFilesystemCache(
    { dinosaurName: "Velociraptor" },
    async () => {
      generatorInvocationCount += 1;
      return generatedImage;
    },
    { outputDirectory: cacheDirectory },
  );

  assert.equal(generatorInvocationCount, 1);

  const secondResult = await resolveGeminiRewardImageWithFilesystemCache(
    { dinosaurName: "  Velociraptor " },
    async () => {
      generatorInvocationCount += 1;
      return createGeminiImage("Velociraptor", {
        imageBase64: Buffer.from("new-bytes").toString("base64"),
      });
    },
    { outputDirectory: cacheDirectory },
  );

  assert.equal(generatorInvocationCount, 1);
  assert.deepEqual(firstResult, generatedImage);
  assert.deepEqual(secondResult, generatedImage);
});

test("resolveGeminiRewardImageWithFilesystemCache dedupes parallel in-flight generation requests", async () => {
  const { resolveGeminiRewardImageWithFilesystemCache } = await geminiImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const generatedImage = createGeminiImage("Stegosaurus");
  let generatorInvocationCount = 0;
  let resolveGenerationGate = () => {};
  let resolveGenerationStarted = () => {};

  const generationGate = new Promise((resolve) => {
    resolveGenerationGate = resolve;
  });
  const generationStarted = new Promise((resolve) => {
    resolveGenerationStarted = resolve;
  });

  const firstRequest = resolveGeminiRewardImageWithFilesystemCache(
    { dinosaurName: "Stegosaurus" },
    async (request) => {
      generatorInvocationCount += 1;
      assert.equal(request.dinosaurName, "Stegosaurus");
      resolveGenerationStarted();
      await generationGate;
      return generatedImage;
    },
    { outputDirectory: cacheDirectory },
  );

  await generationStarted;

  const secondRequest = resolveGeminiRewardImageWithFilesystemCache(
    { dinosaurName: " Stegosaurus " },
    async () => {
      assert.fail("parallel request should share the in-flight generator promise");
      return createGeminiImage("Stegosaurus");
    },
    { outputDirectory: cacheDirectory },
  );

  resolveGenerationGate();
  const [firstResult, secondResult] = await Promise.all([firstRequest, secondRequest]);

  assert.equal(generatorInvocationCount, 1);
  assert.deepEqual(firstResult, generatedImage);
  assert.deepEqual(secondResult, generatedImage);
});

test("readCachedGeminiRewardImage loads pre-existing filesystem assets even when metadata is absent", async () => {
  const {
    readCachedGeminiRewardImage,
    toRewardImageCacheSlug,
  } = await geminiImageCacheModule;

  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const dinosaurName = "Tyrannosaurus Rex";
  const slug = toRewardImageCacheSlug(dinosaurName);
  const expectedBytes = Buffer.from("legacy-jpeg-bytes");
  const legacyImagePath = path.join(cacheDirectory, `${slug}.jpeg`);
  await writeFile(legacyImagePath, expectedBytes);

  const cachedImage = await readCachedGeminiRewardImage(dinosaurName, {
    outputDirectory: cacheDirectory,
  });

  assert.ok(cachedImage);
  assert.equal(cachedImage.dinosaurName, dinosaurName);
  assert.equal(cachedImage.mimeType, "image/jpeg");
  assert.equal(cachedImage.model, "filesystem-cache");
  assert.equal(cachedImage.imageBase64, expectedBytes.toString("base64"));

  const cacheDirectoryEntries = await readdir(cacheDirectory);
  assert.deepEqual(cacheDirectoryEntries, [`${slug}.jpeg`]);
});
