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

function createGeneratedImage(dinosaurName, overrides = {}) {
  return {
    dinosaurName,
    prompt: `cinematic portrait of ${dinosaurName}`,
    model: "gpt-image-2",
    mimeType: "image/png",
    imageBase64: Buffer.from(`${dinosaurName}-bytes`).toString("base64"),
    ...overrides,
  };
}

const rewardImageCacheModule = loadTypeScriptModule(
  "src/features/rewards/lib/reward-image-cache.ts",
);

test("resolveRewardImageWithFilesystemCache persists new images and marks disk existence", async () => {
  const {
    doesRewardImageExistOnDisk,
    readCachedRewardImage,
    resolveRewardImageWithFilesystemCache,
  } = await rewardImageCacheModule;

  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const generatedImage = createGeneratedImage("Triceratops");
  let generatorInvocationCount = 0;

  const result = await resolveRewardImageWithFilesystemCache(
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

  const cachedImage = await readCachedRewardImage("Triceratops", {
    outputDirectory: cacheDirectory,
  });
  assert.deepEqual(cachedImage, generatedImage);
});

test("resolveRewardImageWithFilesystemCache skips duplicate generation when cached asset exists", async () => {
  const { resolveRewardImageWithFilesystemCache } = await rewardImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const generatedImage = createGeneratedImage("Velociraptor");
  let generatorInvocationCount = 0;

  const firstResult = await resolveRewardImageWithFilesystemCache(
    { dinosaurName: "Velociraptor" },
    async () => {
      generatorInvocationCount += 1;
      return generatedImage;
    },
    { outputDirectory: cacheDirectory },
  );

  assert.equal(generatorInvocationCount, 1);

  const secondResult = await resolveRewardImageWithFilesystemCache(
    { dinosaurName: "  Velociraptor " },
    async () => {
      generatorInvocationCount += 1;
      return createGeneratedImage("Velociraptor", {
        imageBase64: Buffer.from("new-bytes").toString("base64"),
      });
    },
    { outputDirectory: cacheDirectory },
  );

  assert.equal(generatorInvocationCount, 1);
  assert.deepEqual(firstResult, generatedImage);
  assert.deepEqual(secondResult, generatedImage);
});

test("resolveRewardImageWithFilesystemCache dedupes parallel in-flight generation requests", async () => {
  const { resolveRewardImageWithFilesystemCache } = await rewardImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const generatedImage = createGeneratedImage("Stegosaurus");
  let generatorInvocationCount = 0;
  let resolveGenerationGate = () => {};
  let resolveGenerationStarted = () => {};

  const generationGate = new Promise((resolve) => {
    resolveGenerationGate = resolve;
  });
  const generationStarted = new Promise((resolve) => {
    resolveGenerationStarted = resolve;
  });

  const firstRequest = resolveRewardImageWithFilesystemCache(
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

  const secondRequest = resolveRewardImageWithFilesystemCache(
    { dinosaurName: " Stegosaurus " },
    async () => {
      assert.fail("parallel request should share the in-flight generator promise");
      return createGeneratedImage("Stegosaurus");
    },
    { outputDirectory: cacheDirectory },
  );

  resolveGenerationGate();
  const [firstResult, secondResult] = await Promise.all([firstRequest, secondRequest]);

  assert.equal(generatorInvocationCount, 1);
  assert.deepEqual(firstResult, generatedImage);
  assert.deepEqual(secondResult, generatedImage);
});

test("prefetchRewardImageWithFilesystemCache checks cache first and skips duplicate generation", async () => {
  const {
    prefetchRewardImageWithFilesystemCache,
    resolveRewardImageWithFilesystemCache,
  } = await rewardImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const generatedImage = createGeneratedImage("Pteranodon");
  let generatorInvocationCount = 0;

  await resolveRewardImageWithFilesystemCache(
    { dinosaurName: "Pteranodon" },
    async () => generatedImage,
    { outputDirectory: cacheDirectory },
  );

  const prefetchStatus = await prefetchRewardImageWithFilesystemCache(
    { dinosaurName: " Pteranodon " },
    async () => {
      generatorInvocationCount += 1;
      return createGeneratedImage("Pteranodon", {
        imageBase64: Buffer.from("unexpected-prefetch-bytes").toString("base64"),
      });
    },
    { outputDirectory: cacheDirectory },
  );

  assert.equal(prefetchStatus, "already-cached");
  assert.equal(generatorInvocationCount, 0);
});

test("prefetchRewardImageWithFilesystemCache starts background generation once and dedupes in-flight calls", async () => {
  const {
    prefetchRewardImageWithFilesystemCache,
    resolveRewardImageWithFilesystemCache,
  } = await rewardImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const generatedImage = createGeneratedImage("Carnotaurus");
  let generatorInvocationCount = 0;
  let resolveGenerationGate = () => {};
  let resolveGenerationStarted = () => {};

  const generationGate = new Promise((resolve) => {
    resolveGenerationGate = resolve;
  });
  const generationStarted = new Promise((resolve) => {
    resolveGenerationStarted = resolve;
  });

  const firstPrefetchStatus = await prefetchRewardImageWithFilesystemCache(
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

  const secondPrefetchStatus = await prefetchRewardImageWithFilesystemCache(
    { dinosaurName: " Carnotaurus " },
    async () => {
      assert.fail("parallel prefetch should reuse the in-flight generation");
      return createGeneratedImage("Carnotaurus");
    },
    { outputDirectory: cacheDirectory },
  );

  resolveGenerationGate();
  const resolvedImage = await resolveRewardImageWithFilesystemCache(
    { dinosaurName: "Carnotaurus" },
    async () => {
      assert.fail("resolved image should come from the prefetch generation");
      return createGeneratedImage("Carnotaurus");
    },
    { outputDirectory: cacheDirectory },
  );

  assert.equal(firstPrefetchStatus, "started");
  assert.equal(secondPrefetchStatus, "already-in-flight");
  assert.equal(generatorInvocationCount, 1);
  assert.deepEqual(resolvedImage, generatedImage);
});

test("readCachedRewardImage loads pre-existing filesystem assets even when metadata is absent", async () => {
  const {
    readCachedRewardImage,
    toRewardImageCacheSlug,
  } = await rewardImageCacheModule;

  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const dinosaurName = "Tyrannosaurus Rex";
  const slug = toRewardImageCacheSlug(dinosaurName);
  const expectedBytes = Buffer.from("legacy-jpeg-bytes");
  const legacyImagePath = path.join(cacheDirectory, `${slug}.jpeg`);
  await writeFile(legacyImagePath, expectedBytes);

  const cachedImage = await readCachedRewardImage(dinosaurName, {
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

test("getRewardImageGenerationStatus reports missing when no cached image or in-flight generation exists", async () => {
  const { getRewardImageGenerationStatus } = await rewardImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));

  const status = await getRewardImageGenerationStatus("Allosaurus", {
    outputDirectory: cacheDirectory,
  });

  assert.deepEqual(status, {
    dinosaurName: "Allosaurus",
    status: "missing",
    imagePath: null,
  });
});

test("getRewardImageGenerationStatus reports generating during in-flight prefetch and ready once image is persisted", async () => {
  const {
    getRewardImageGenerationStatus,
    prefetchRewardImageWithFilesystemCache,
    resolveRewardImageWithFilesystemCache,
  } = await rewardImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const generatedImage = createGeneratedImage("Stigimoloch");
  let resolveGenerationGate = () => {};
  let resolveGenerationStarted = () => {};

  const generationGate = new Promise((resolve) => {
    resolveGenerationGate = resolve;
  });
  const generationStarted = new Promise((resolve) => {
    resolveGenerationStarted = resolve;
  });

  const prefetchStatus = await prefetchRewardImageWithFilesystemCache(
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

  const generatingStatus = await getRewardImageGenerationStatus("Stigimoloch", {
    outputDirectory: cacheDirectory,
  });

  assert.deepEqual(generatingStatus, {
    dinosaurName: "Stigimoloch",
    status: "generating",
    imagePath: null,
  });

  resolveGenerationGate();
  await resolveRewardImageWithFilesystemCache(
    { dinosaurName: "Stigimoloch" },
    async () => {
      assert.fail("resolved image should reuse the prefetch in-flight generation");
      return createGeneratedImage("Stigimoloch");
    },
    { outputDirectory: cacheDirectory },
  );

  const readyStatus = await getRewardImageGenerationStatus("Stigimoloch", {
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

test("getRewardImageGenerationStatus prefers the newest cached extension when multiple files exist", async () => {
  const { getRewardImageGenerationStatus, toRewardImageCacheSlug } = await rewardImageCacheModule;
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

  const status = await getRewardImageGenerationStatus(dinosaurName, {
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

test("persistRewardImageToFilesystemCache removes stale sibling formats for the same dinosaur", async () => {
  const {
    persistRewardImageToFilesystemCache,
    toRewardImageCacheSlug,
  } = await rewardImageCacheModule;
  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const dinosaurName = "Spinosaurus";

  await persistRewardImageToFilesystemCache(
    createGeneratedImage(dinosaurName, {
      mimeType: "image/png",
      imageBase64: Buffer.from("png-bytes").toString("base64"),
    }),
    { outputDirectory: cacheDirectory },
  );

  await persistRewardImageToFilesystemCache(
    createGeneratedImage(dinosaurName, {
      mimeType: "image/jpeg",
      imageBase64: Buffer.from("jpg-bytes").toString("base64"),
    }),
    { outputDirectory: cacheDirectory },
  );

  const slug = toRewardImageCacheSlug(dinosaurName);
  const entries = (await readdir(cacheDirectory)).sort();
  assert.deepEqual(entries, [`${slug}.jpg`, `${slug}.jpg.metadata.json`]);
});

test("resolveRewardImageWithFilesystemCache forwards the dossier block and model override to the generator", async () => {
  const { resolveRewardImageWithFilesystemCache, prefetchRewardImageWithFilesystemCache } =
    await rewardImageCacheModule;

  const cacheDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  const seenRequests = [];

  await resolveRewardImageWithFilesystemCache(
    {
      dinosaurName: " Compsognathus ",
      dossierPromptBlock: "Field dossier for Compsognathus: Length: 1.0 m.",
      modelOverride: "gpt-image-2-hd",
    },
    async (request) => {
      seenRequests.push(request);
      return createGeneratedImage("Compsognathus");
    },
    { outputDirectory: cacheDirectory },
  );

  assert.deepEqual(seenRequests, [
    {
      dinosaurName: "Compsognathus",
      dossierPromptBlock: "Field dossier for Compsognathus: Length: 1.0 m.",
      modelOverride: "gpt-image-2-hd",
    },
  ]);

  const prefetchDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-"));
  let prefetchResolve;
  const prefetchSeen = new Promise((resolve) => {
    prefetchResolve = resolve;
  });
  const status = await prefetchRewardImageWithFilesystemCache(
    { dinosaurName: "Gallimimus", dossierPromptBlock: "Field dossier for Gallimimus." },
    async (request) => {
      prefetchResolve(request);
      return createGeneratedImage("Gallimimus");
    },
    { outputDirectory: prefetchDirectory },
  );
  assert.equal(status, "started");
  assert.deepEqual(await prefetchSeen, {
    dinosaurName: "Gallimimus",
    dossierPromptBlock: "Field dossier for Gallimimus.",
  });
});
