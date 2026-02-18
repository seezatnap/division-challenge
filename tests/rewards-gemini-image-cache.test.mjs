import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, utimes, writeFile } from "node:fs/promises";
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

test("prefetchGeminiRewardImageWithFilesystemCache checks cache first and skips duplicate generation", async () => {
  const {
    prefetchGeminiRewardImageWithFilesystemCache,
    resolveGeminiRewardImageWithFilesystemCache,
  } = await geminiImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const generatedImage = createGeminiImage("Pteranodon");
  let generatorInvocationCount = 0;

  await resolveGeminiRewardImageWithFilesystemCache(
    { dinosaurName: "Pteranodon" },
    async () => generatedImage,
    { outputDirectory: cacheDirectory },
  );

  const prefetchStatus = await prefetchGeminiRewardImageWithFilesystemCache(
    { dinosaurName: " Pteranodon " },
    async () => {
      generatorInvocationCount += 1;
      return createGeminiImage("Pteranodon", {
        imageBase64: Buffer.from("unexpected-prefetch-bytes").toString("base64"),
      });
    },
    { outputDirectory: cacheDirectory },
  );

  assert.equal(prefetchStatus, "already-cached");
  assert.equal(generatorInvocationCount, 0);
});

test("prefetchGeminiRewardImageWithFilesystemCache starts background generation once and dedupes in-flight calls", async () => {
  const {
    prefetchGeminiRewardImageWithFilesystemCache,
    resolveGeminiRewardImageWithFilesystemCache,
  } = await geminiImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const generatedImage = createGeminiImage("Carnotaurus");
  let generatorInvocationCount = 0;
  let resolveGenerationGate = () => {};
  let resolveGenerationStarted = () => {};

  const generationGate = new Promise((resolve) => {
    resolveGenerationGate = resolve;
  });
  const generationStarted = new Promise((resolve) => {
    resolveGenerationStarted = resolve;
  });

  const firstPrefetchStatus = await prefetchGeminiRewardImageWithFilesystemCache(
    { dinosaurName: "Carnotaurus" },
    async (request) => {
      generatorInvocationCount += 1;
      assert.equal(request.dinosaurName, "Carnotaurus");
      resolveGenerationStarted();
      await generationGate;
      return generatedImage;
    },
    { outputDirectory: cacheDirectory },
  );

  await generationStarted;

  const secondPrefetchStatus = await prefetchGeminiRewardImageWithFilesystemCache(
    { dinosaurName: " Carnotaurus " },
    async () => {
      assert.fail("parallel prefetch should reuse the in-flight generation");
      return createGeminiImage("Carnotaurus");
    },
    { outputDirectory: cacheDirectory },
  );

  resolveGenerationGate();
  const resolvedImage = await resolveGeminiRewardImageWithFilesystemCache(
    { dinosaurName: "Carnotaurus" },
    async () => {
      assert.fail("resolved image should come from the prefetch generation");
      return createGeminiImage("Carnotaurus");
    },
    { outputDirectory: cacheDirectory },
  );

  assert.equal(firstPrefetchStatus, "started");
  assert.equal(secondPrefetchStatus, "already-in-flight");
  assert.equal(generatorInvocationCount, 1);
  assert.deepEqual(resolvedImage, generatedImage);
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

test("getGeminiRewardImageGenerationStatus reports missing when no cached image or in-flight generation exists", async () => {
  const { getGeminiRewardImageGenerationStatus } = await geminiImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));

  const status = await getGeminiRewardImageGenerationStatus("Allosaurus", {
    outputDirectory: cacheDirectory,
  });

  assert.deepEqual(status, {
    dinosaurName: "Allosaurus",
    status: "missing",
    imagePath: null,
  });
});

test("getGeminiRewardImageGenerationStatus reports generating during in-flight prefetch and ready once image is persisted", async () => {
  const {
    getGeminiRewardImageGenerationStatus,
    prefetchGeminiRewardImageWithFilesystemCache,
    resolveGeminiRewardImageWithFilesystemCache,
  } = await geminiImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const generatedImage = createGeminiImage("Stigimoloch");
  let resolveGenerationGate = () => {};
  let resolveGenerationStarted = () => {};

  const generationGate = new Promise((resolve) => {
    resolveGenerationGate = resolve;
  });
  const generationStarted = new Promise((resolve) => {
    resolveGenerationStarted = resolve;
  });

  const prefetchStatus = await prefetchGeminiRewardImageWithFilesystemCache(
    { dinosaurName: "Stigimoloch" },
    async () => {
      resolveGenerationStarted();
      await generationGate;
      return generatedImage;
    },
    { outputDirectory: cacheDirectory },
  );

  assert.equal(prefetchStatus, "started");
  await generationStarted;

  const generatingStatus = await getGeminiRewardImageGenerationStatus("Stigimoloch", {
    outputDirectory: cacheDirectory,
  });

  assert.deepEqual(generatingStatus, {
    dinosaurName: "Stigimoloch",
    status: "generating",
    imagePath: null,
  });

  resolveGenerationGate();
  await resolveGeminiRewardImageWithFilesystemCache(
    { dinosaurName: "Stigimoloch" },
    async () => {
      assert.fail("resolved image should reuse the prefetch in-flight generation");
      return createGeminiImage("Stigimoloch");
    },
    { outputDirectory: cacheDirectory },
  );

  const readyStatus = await getGeminiRewardImageGenerationStatus("Stigimoloch", {
    outputDirectory: cacheDirectory,
  });

  assert.equal(readyStatus.dinosaurName, "Stigimoloch");
  assert.equal(readyStatus.status, "ready");
  assert.ok(
    typeof readyStatus.imagePath === "string" &&
      readyStatus.imagePath.startsWith("/rewards/stigimoloch.png?v="),
    `Expected cache-busted reward path, received: ${readyStatus.imagePath}`,
  );
});

test("getGeminiRewardImageGenerationStatus prefers the newest cached extension when multiple files exist", async () => {
  const { getGeminiRewardImageGenerationStatus, toRewardImageCacheSlug } = await geminiImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const dinosaurName = "Tyrannosaurus Rex";
  const slug = toRewardImageCacheSlug(dinosaurName);
  const pngPath = path.join(cacheDirectory, `${slug}.png`);
  const jpgPath = path.join(cacheDirectory, `${slug}.jpg`);
  const now = new Date();
  const oldTime = new Date(now.getTime() - 60_000);

  await writeFile(pngPath, Buffer.from("older-png"));
  await writeFile(jpgPath, Buffer.from("newer-jpg"));
  await utimes(pngPath, oldTime, oldTime);
  await utimes(jpgPath, now, now);

  const status = await getGeminiRewardImageGenerationStatus(dinosaurName, {
    outputDirectory: cacheDirectory,
  });

  assert.equal(status.dinosaurName, dinosaurName);
  assert.equal(status.status, "ready");
  assert.ok(
    typeof status.imagePath === "string" &&
      status.imagePath.startsWith("/rewards/tyrannosaurus-rex.jpg?v="),
    `Expected newest extension with cache-buster path, received: ${status.imagePath}`,
  );
});

test("persistGeminiRewardImageToFilesystemCache removes stale sibling formats for the same dinosaur", async () => {
  const {
    persistGeminiRewardImageToFilesystemCache,
    toRewardImageCacheSlug,
  } = await geminiImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const dinosaurName = "Spinosaurus";

  await persistGeminiRewardImageToFilesystemCache(
    createGeminiImage(dinosaurName, {
      mimeType: "image/png",
      imageBase64: Buffer.from("png-bytes").toString("base64"),
    }),
    { outputDirectory: cacheDirectory },
  );

  await persistGeminiRewardImageToFilesystemCache(
    createGeminiImage(dinosaurName, {
      mimeType: "image/jpeg",
      imageBase64: Buffer.from("jpg-bytes").toString("base64"),
    }),
    { outputDirectory: cacheDirectory },
  );

  const slug = toRewardImageCacheSlug(dinosaurName);
  const entries = (await readdir(cacheDirectory)).sort();
  assert.deepEqual(entries, [`${slug}.jpg`, `${slug}.jpg.metadata.json`]);
});
