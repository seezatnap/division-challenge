import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTypeScriptModule } from "../scripts/lib/load-typescript-module.mjs";

// Give this test file its own database; the modules read the URL lazily on the
// first query so it must be set before anything touches the cache.
const databaseDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-cache-db-"));
process.env.TURSO_DATABASE_URL = `file:${path.join(databaseDirectory, "cache.sqlite3")}`;

const modules = Promise.all([
  loadTypeScriptModule("src/features/rewards/lib/reward-image-cache.ts"),
  loadTypeScriptModule("src/features/persistence/lib/object-storage.ts"),
  loadTypeScriptModule("src/features/persistence/lib/database.ts"),
]).then(([rewardImageCache, objectStorage, database]) => ({
  rewardImageCache,
  objectStorage,
  database,
}));

let dinosaurCounter = 0;
/** Unique reward names keep tests independent while sharing one database. */
function uniqueDinosaurName(base) {
  dinosaurCounter += 1;
  return `${base} ${dinosaurCounter}`;
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

test("database location resolves TURSO_DATABASE_URL file overrides and Turso URLs", async () => {
  const { database } = await modules;

  const localConfig = database.resolveDatabaseConfig({
    TURSO_DATABASE_URL: "file:/tmp/some/dir/app.sqlite3",
  });
  assert.equal(localConfig.driver, "local-file");
  assert.equal(localConfig.databasePath, "/tmp/some/dir/app.sqlite3");
  assert.equal(localConfig.databaseFile, "app.sqlite3");

  const tursoConfig = database.resolveDatabaseConfig({
    TURSO_DATABASE_URL: "libsql://dino-division-example.turso.io",
    TURSO_AUTH_TOKEN: "secret-token",
  });
  assert.equal(tursoConfig.driver, "turso");
  assert.equal(tursoConfig.url, "libsql://dino-division-example.turso.io");
  assert.equal(tursoConfig.authToken, "secret-token");
  assert.equal(tursoConfig.databasePath, null);

  const defaultConfig = database.resolveDatabaseConfig({});
  assert.equal(defaultConfig.driver, "local-file");
  assert.ok(defaultConfig.databasePath.endsWith(`${path.sep}.sqlite${path.sep}division-challenge.sqlite3`));

  const location = database.getDatabaseLocation({
    TURSO_DATABASE_URL: "libsql://dino-division-example.turso.io",
    TURSO_AUTH_TOKEN: "secret-token",
  });
  assert.equal("authToken" in location, false, "location snapshot must never expose the auth token");
});

test("R2 configuration resolves from the environment with sensible defaults", async () => {
  const { objectStorage } = await modules;

  assert.equal(objectStorage.isR2Configured({}), false);
  assert.throws(() => objectStorage.resolveR2StorageConfig({ R2_BUCKET: "dino" }), /R2_ACCOUNT_ID/);

  const config = objectStorage.resolveR2StorageConfig({
    R2_ACCOUNT_ID: "acct123",
    R2_ACCESS_KEY_ID: "key",
    R2_SECRET_ACCESS_KEY: "secret",
    R2_BUCKET: "dino-rewards",
    R2_PUBLIC_BASE_URL: "https://img.example.com/",
    R2_KEY_PREFIX: "/custom/prefix/",
  });
  assert.equal(config.endpoint, "https://acct123.r2.cloudflarestorage.com");
  assert.equal(config.publicBaseUrl, "https://img.example.com");
  assert.equal(config.keyPrefix, "custom/prefix");
});

test("R2 storage adapter issues put/get/delete commands against the configured bucket", async () => {
  const { objectStorage } = await modules;
  const sentCommands = [];
  const storedBody = new Uint8Array([1, 2, 3]);
  const fakeClient = {
    async send(command) {
      sentCommands.push(command);
      const commandName = command.constructor.name;
      if (commandName === "GetObjectCommand") {
        if (command.input.Key.endsWith("missing.png")) {
          const error = new Error("NoSuchKey");
          error.name = "NoSuchKey";
          throw error;
        }
        return {
          Body: { transformToByteArray: async () => storedBody },
          ContentType: "image/png",
        };
      }
      return {};
    },
  };

  const storage = objectStorage.createR2RewardImageStorage(
    {
      accountId: "acct",
      accessKeyId: "key",
      secretAccessKey: "secret",
      bucket: "dino-rewards",
      endpoint: "https://acct.r2.cloudflarestorage.com",
      publicBaseUrl: "https://img.example.com",
      keyPrefix: "rewards",
    },
    { client: fakeClient },
  );

  await storage.putObject({ key: "rewards/a/1.png", body: storedBody, contentType: "image/png" });
  const fetched = await storage.getObject("rewards/a/1.png");
  const missing = await storage.getObject("rewards/a/missing.png");
  await storage.deleteObject("rewards/a/1.png");

  assert.deepEqual(
    sentCommands.map((command) => [command.constructor.name, command.input.Bucket, command.input.Key]),
    [
      ["PutObjectCommand", "dino-rewards", "rewards/a/1.png"],
      ["GetObjectCommand", "dino-rewards", "rewards/a/1.png"],
      ["GetObjectCommand", "dino-rewards", "rewards/a/missing.png"],
      ["DeleteObjectCommand", "dino-rewards", "rewards/a/1.png"],
    ],
  );
  assert.equal(sentCommands[0].input.ContentType, "image/png");
  assert.match(sentCommands[0].input.CacheControl, /immutable/);
  assert.deepEqual(fetched, { body: storedBody, contentType: "image/png" });
  assert.equal(missing, null);
  assert.equal(storage.toPublicUrl("rewards/a/1.png"), "https://img.example.com/rewards/a/1.png");
  await assert.rejects(
    () => storage.getObject("../escape"),
    /Invalid object storage key/,
  );
});

test("filesystem storage adapter round-trips objects under its directory and rejects escapes", async () => {
  const { objectStorage } = await modules;
  const directory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-fs-storage-"));
  const storage = objectStorage.createFilesystemRewardImageStorage(directory);

  await storage.putObject({
    key: "rewards/velociraptor/1-abc.png",
    body: new Uint8Array([9, 8, 7]),
    contentType: "image/png",
  });
  const fetched = await storage.getObject("rewards/velociraptor/1-abc.png");
  assert.deepEqual(Array.from(fetched.body), [9, 8, 7]);
  assert.equal(await storage.getObject("rewards/velociraptor/nope.png"), null);
  await storage.deleteObject("rewards/velociraptor/1-abc.png");
  assert.equal(await storage.getObject("rewards/velociraptor/1-abc.png"), null);
  await assert.rejects(
    () => storage.putObject({ key: "../outside.png", body: new Uint8Array(), contentType: "image/png" }),
    /Invalid object storage key/,
  );
  assert.equal(storage.toPublicUrl("rewards/velociraptor/1-abc.png"), null);
});

test("resolveRewardImageWithCache uploads new images, records them, and serves them from cache afterwards", async () => {
  const { rewardImageCache, objectStorage } = await modules;
  const storage = objectStorage.createInMemoryRewardImageStorage({
    publicBaseUrl: "https://img.example.com",
  });
  const dinosaurName = uniqueDinosaurName("Triceratops");
  const generatedImage = createGeneratedImage(dinosaurName);
  let generatorInvocationCount = 0;

  const result = await rewardImageCache.resolveRewardImageWithCache(
    { dinosaurName: ` ${dinosaurName} ` },
    async (request) => {
      generatorInvocationCount += 1;
      assert.equal(request.dinosaurName, dinosaurName);
      return generatedImage;
    },
    { storage },
  );

  assert.equal(generatorInvocationCount, 1);
  assert.deepEqual(result, generatedImage);
  assert.equal(await rewardImageCache.doesRewardImageExist(dinosaurName, { storage }), true);

  const [storageKey] = [...storage.objects.keys()];
  const slug = rewardImageCache.toRewardImageCacheSlug(dinosaurName);
  assert.match(storageKey, new RegExp(`^rewards/${slug}/\\d+-[0-9a-f]{12}\\.png$`));

  const record = await rewardImageCache.findCurrentRewardImage(dinosaurName, { storage });
  assert.equal(record.storageKey, storageKey);
  assert.equal(record.mimeType, "image/png");
  assert.equal(record.extension, "png");
  assert.equal(record.model, "gpt-image-2");
  assert.equal(record.source, "openai");
  assert.equal(record.byteSize, Buffer.from(`${dinosaurName}-bytes`).byteLength);
  assert.equal(
    record.sha256,
    createHash("sha256").update(Buffer.from(`${dinosaurName}-bytes`)).digest("hex"),
  );
  assert.equal(record.imagePath, `https://img.example.com/${storageKey}`);

  const cached = await rewardImageCache.resolveRewardImageWithCache(
    { dinosaurName },
    async () => {
      assert.fail("cached image should not trigger generation");
    },
    { storage },
  );
  assert.equal(cached.imageBase64, generatedImage.imageBase64);
  assert.equal(cached.prompt, generatedImage.prompt);
  assert.equal(cached.source, "openai");
  assert.equal(generatorInvocationCount, 1);
});

test("every generated image is recorded in history and the state points at the newest one", async () => {
  const { rewardImageCache, objectStorage } = await modules;
  const storage = objectStorage.createInMemoryRewardImageStorage();
  const dinosaurName = uniqueDinosaurName("Stegosaurus");

  const first = await rewardImageCache.persistRewardImage(
    createGeneratedImage(dinosaurName, { imageBase64: Buffer.from("first").toString("base64") }),
    { storage, createdAtMs: 1_000 },
  );
  const second = await rewardImageCache.persistRewardImage(
    createGeneratedImage(dinosaurName, {
      mimeType: "image/jpeg",
      model: "local-fallback-svg",
      imageBase64: Buffer.from("second").toString("base64"),
    }),
    { storage, createdAtMs: 2_000 },
  );

  assert.equal(first.createdAtMs, 1_000);
  assert.equal(second.createdAtMs, 2_000);
  assert.equal(second.extension, "jpg");
  assert.equal(second.source, "fallback-svg", "source is inferred from the fallback model");
  assert.equal(storage.objects.size, 2, "old images are kept as history objects");

  const history = await rewardImageCache.listRewardImageHistory(dinosaurName, { storage });
  assert.deepEqual(
    history.map((image) => image.id),
    [second.id, first.id],
  );

  const current = await rewardImageCache.findCurrentRewardImage(dinosaurName, { storage });
  assert.equal(current.id, second.id);
  assert.equal(current.imagePath, `/rewards/${current.slug}.jpg?v=2000`);

  const bySha = await rewardImageCache.findRewardImageBySha256(dinosaurName, first.sha256, { storage });
  assert.equal(bySha.id, first.id);
  assert.equal(await rewardImageCache.findRewardImageBySha256(dinosaurName, "nope", { storage }), null);

  const migrated = await rewardImageCache.persistRewardImage(
    createGeneratedImage(dinosaurName, { imageBase64: Buffer.from("third").toString("base64") }),
    { storage, source: "filesystem-migration" },
  );
  assert.equal(migrated.source, "filesystem-migration");

  const records = await rewardImageCache.listRewardImageCacheDatabaseRecords({ storage });
  const record = records.find((entry) => entry.dinosaurName === dinosaurName);
  assert.equal(record.status, "ready");
  assert.equal(record.imageId, migrated.id);
  assert.equal(record.storageKey, migrated.storageKey);
});

test("resolveRewardImageWithCache dedupes parallel in-flight generation requests", async () => {
  const { rewardImageCache, objectStorage } = await modules;
  const storage = objectStorage.createInMemoryRewardImageStorage();
  const dinosaurName = uniqueDinosaurName("Spinosaurus");
  const generatedImage = createGeneratedImage(dinosaurName);
  let generatorInvocationCount = 0;
  let releaseGeneration = () => {};
  const generationGate = new Promise((resolve) => {
    releaseGeneration = resolve;
  });

  const generateImage = async () => {
    generatorInvocationCount += 1;
    await generationGate;
    return generatedImage;
  };

  const firstPromise = rewardImageCache.resolveRewardImageWithCache(
    { dinosaurName },
    generateImage,
    { storage },
  );
  // Let the first call pass its cache miss and register as in-flight.
  await new Promise((resolve) => setTimeout(resolve, 20));
  const secondPromise = rewardImageCache.resolveRewardImageWithCache(
    { dinosaurName },
    generateImage,
    { storage },
  );

  const generatingStatus = await rewardImageCache.getRewardImageGenerationStatus(dinosaurName, {
    storage,
  });
  assert.equal(generatingStatus.status, "generating");
  assert.equal(generatingStatus.imagePath, null);

  releaseGeneration();
  const [first, second] = await Promise.all([firstPromise, secondPromise]);
  assert.deepEqual(first, generatedImage);
  assert.deepEqual(second, generatedImage);
  assert.equal(generatorInvocationCount, 1);
  assert.equal(storage.objects.size, 1);
});

test("prefetchRewardImage checks cache first, starts background generation once, and dedupes", async () => {
  const { rewardImageCache, objectStorage } = await modules;
  const storage = objectStorage.createInMemoryRewardImageStorage();
  const dinosaurName = uniqueDinosaurName("Velociraptor");
  const generatedImage = createGeneratedImage(dinosaurName);
  let generatorInvocationCount = 0;
  let releaseGeneration = () => {};
  const generationGate = new Promise((resolve) => {
    releaseGeneration = resolve;
  });

  const generateImage = async () => {
    generatorInvocationCount += 1;
    await generationGate;
    return generatedImage;
  };

  const startedStatus = await rewardImageCache.prefetchRewardImage(
    { dinosaurName },
    generateImage,
    { storage },
  );
  assert.equal(startedStatus, "started");

  const inFlightStatus = await rewardImageCache.prefetchRewardImage(
    { dinosaurName },
    generateImage,
    { storage },
  );
  assert.equal(inFlightStatus, "already-in-flight");

  releaseGeneration();
  const resolved = await rewardImageCache.resolveRewardImageWithCache(
    { dinosaurName },
    async () => {
      assert.fail("in-flight prefetch should satisfy resolve without another generator call");
    },
    { storage },
  );
  assert.deepEqual(resolved, generatedImage);

  const cachedStatus = await rewardImageCache.prefetchRewardImage(
    { dinosaurName },
    generateImage,
    { storage },
  );
  assert.equal(cachedStatus, "already-cached");
  assert.equal(generatorInvocationCount, 1);
});

test("getRewardImageGenerationStatus reports missing, generating, and ready transitions", async () => {
  const { rewardImageCache, objectStorage } = await modules;
  const storage = objectStorage.createInMemoryRewardImageStorage();
  const dinosaurName = uniqueDinosaurName("Gallimimus");

  assert.deepEqual(await rewardImageCache.getRewardImageGenerationStatus(dinosaurName, { storage }), {
    dinosaurName,
    status: "missing",
    imagePath: null,
  });

  let releaseGeneration = () => {};
  const generationGate = new Promise((resolve) => {
    releaseGeneration = resolve;
  });
  await rewardImageCache.prefetchRewardImage(
    { dinosaurName },
    async () => {
      await generationGate;
      return createGeneratedImage(dinosaurName, { mimeType: "image/jpeg" });
    },
    { storage },
  );

  assert.deepEqual(await rewardImageCache.getRewardImageGenerationStatus(dinosaurName, { storage }), {
    dinosaurName,
    status: "generating",
    imagePath: null,
  });

  releaseGeneration();
  await rewardImageCache.resolveRewardImageWithCache(
    { dinosaurName },
    async () => assert.fail("should reuse in-flight generation"),
    { storage },
  );

  const readyStatus = await rewardImageCache.getRewardImageGenerationStatus(dinosaurName, { storage });
  assert.equal(readyStatus.status, "ready");
  const slug = rewardImageCache.toRewardImageCacheSlug(dinosaurName);
  assert.match(readyStatus.imagePath, new RegExp(`^/rewards/${slug}\\.jpg\\?v=\\d+$`));
});

test("a failed generation resets the state to missing and rethrows", async () => {
  const { rewardImageCache, objectStorage } = await modules;
  const storage = objectStorage.createInMemoryRewardImageStorage();
  const dinosaurName = uniqueDinosaurName("Compsognathus");

  await assert.rejects(
    () =>
      rewardImageCache.resolveRewardImageWithCache(
        { dinosaurName },
        async () => {
          throw new Error("provider exploded");
        },
        { storage },
      ),
    /provider exploded/,
  );

  assert.deepEqual(await rewardImageCache.getRewardImageGenerationStatus(dinosaurName, { storage }), {
    dinosaurName,
    status: "missing",
    imagePath: null,
  });
  assert.equal(storage.objects.size, 0);
});

test("readCachedRewardImage resets state when the stored object disappeared", async () => {
  const { rewardImageCache, objectStorage } = await modules;
  const storage = objectStorage.createInMemoryRewardImageStorage();
  const dinosaurName = uniqueDinosaurName("Parasaurolophus");

  const record = await rewardImageCache.persistRewardImage(createGeneratedImage(dinosaurName), {
    storage,
  });
  storage.objects.delete(record.storageKey);

  assert.equal(await rewardImageCache.readCachedRewardImage(dinosaurName, { storage }), null);
  assert.equal(
    (await rewardImageCache.getRewardImageGenerationStatus(dinosaurName, { storage })).status,
    "missing",
  );

  let generatorInvocationCount = 0;
  await rewardImageCache.resolveRewardImageWithCache(
    { dinosaurName },
    async () => {
      generatorInvocationCount += 1;
      return createGeneratedImage(dinosaurName);
    },
    { storage },
  );
  assert.equal(generatorInvocationCount, 1, "a lost object triggers regeneration");
});

test("resolveRewardImageWithCache forwards the dossier block and model override to the generator", async () => {
  const { rewardImageCache, objectStorage } = await modules;
  const storage = objectStorage.createInMemoryRewardImageStorage();
  const dinosaurName = uniqueDinosaurName("Dilophosaurus");
  let seenRequest;

  await rewardImageCache.resolveRewardImageWithCache(
    {
      dinosaurName: ` ${dinosaurName} `,
      modelOverride: "gpt-image-2-turbo",
      dossierPromptBlock: "Field dossier: crest, frill, venom.",
    },
    async (request) => {
      seenRequest = request;
      return createGeneratedImage(dinosaurName);
    },
    { storage },
  );

  assert.deepEqual(seenRequest, {
    dinosaurName,
    modelOverride: "gpt-image-2-turbo",
    dossierPromptBlock: "Field dossier: crest, frill, venom.",
  });
});

test("deleteRewardImageCacheEntry removes every stored object and row and marks the reward missing", async () => {
  const { rewardImageCache, objectStorage } = await modules;
  const storage = objectStorage.createInMemoryRewardImageStorage();
  const dinosaurName = uniqueDinosaurName("Brachiosaurus");

  const first = await rewardImageCache.persistRewardImage(
    createGeneratedImage(dinosaurName, { imageBase64: Buffer.from("one").toString("base64") }),
    { storage },
  );
  const second = await rewardImageCache.persistRewardImage(
    createGeneratedImage(dinosaurName, { imageBase64: Buffer.from("two").toString("base64") }),
    { storage },
  );
  assert.equal(storage.objects.size, 2);

  const result = await rewardImageCache.deleteRewardImageCacheEntry(dinosaurName, { storage });
  assert.equal(result.dinosaurName, dinosaurName);
  assert.equal(result.deletedDatabaseRecord, true);
  assert.equal(result.deletedImageCount, 2);
  assert.deepEqual([...result.deletedStorageKeys].sort(), [first.storageKey, second.storageKey].sort());
  assert.equal(storage.objects.size, 0);
  assert.deepEqual(await rewardImageCache.listRewardImageHistory(dinosaurName, { storage }), []);

  const record = await rewardImageCache.getRewardImageCacheDatabaseRecord(dinosaurName, { storage });
  assert.equal(record.status, "missing");
  assert.equal(record.imageId, null);
  assert.equal(record.imagePath, null);
});

test("parseRewardImageFileName accepts <slug>.<ext> file names only", async () => {
  const { rewardImageCache } = await modules;

  assert.deepEqual(rewardImageCache.parseRewardImageFileName("tyrannosaurus-rex.png"), {
    slug: "tyrannosaurus-rex",
    extension: "png",
  });
  assert.deepEqual(rewardImageCache.parseRewardImageFileName("Hybrid-A-B.JPG"), {
    slug: "hybrid-a-b",
    extension: "jpg",
  });
  assert.equal(rewardImageCache.parseRewardImageFileName("../etc/passwd"), null);
  assert.equal(rewardImageCache.parseRewardImageFileName("noext"), null);
  assert.equal(rewardImageCache.parseRewardImageFileName("bad.exe"), null);
});

test("getRewardImageGenerationStatuses answers many rewards in one query without fetching bytes", async () => {
  const { rewardImageCache, objectStorage } = await modules;
  const storage = objectStorage.createInMemoryRewardImageStorage();
  const readyName = uniqueDinosaurName("Allosaurus");
  const missingName = uniqueDinosaurName("Carnotaurus");
  const generatingName = uniqueDinosaurName("Baryonyx");

  await rewardImageCache.persistRewardImage(createGeneratedImage(readyName), { storage });

  let releaseGeneration = () => {};
  const generationGate = new Promise((resolve) => {
    releaseGeneration = resolve;
  });
  await rewardImageCache.prefetchRewardImage(
    { dinosaurName: generatingName },
    async () => {
      await generationGate;
      return createGeneratedImage(generatingName);
    },
    { storage },
  );

  // Object reads would be the expensive part; assert none happen.
  const originalGetObject = storage.getObject.bind(storage);
  let getObjectCallCount = 0;
  storage.getObject = async (key) => {
    getObjectCallCount += 1;
    return originalGetObject(key);
  };

  const statuses = await rewardImageCache.getRewardImageGenerationStatuses(
    [readyName, missingName, generatingName, "   "],
    { storage },
  );

  assert.equal(getObjectCallCount, 0, "bulk status must not download image bytes");
  assert.deepEqual(
    statuses.map((entry) => [entry.dinosaurName, entry.status]),
    [
      [readyName, "ready"],
      [missingName, "missing"],
      [generatingName, "generating"],
    ],
  );
  assert.match(statuses[0].imagePath, /\.png\?v=\d+$/);
  assert.equal(statuses[1].imagePath, null);
  assert.deepEqual(await rewardImageCache.getRewardImageGenerationStatuses([], { storage }), []);

  storage.getObject = originalGetObject;
  releaseGeneration();
});
