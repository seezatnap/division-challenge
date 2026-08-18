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

async function loadRewardsCacheRoute({
  listRecordsImpl = async () => [],
  getRecordImpl = async () => null,
  listHistoryImpl = async () => [],
  deleteEntryImpl = async () => ({
    dinosaurName: "Velociraptor",
    deletedDatabaseRecord: true,
    deletedImageCount: 1,
    deletedStorageKeys: ["rewards/velociraptor/1-abc.png"],
  }),
  databaseLocationImpl = () => ({
    driver: "local-file",
    url: "file:/repo/.sqlite/division-challenge.sqlite3",
    projectRoot: "/repo",
    sqliteDirectory: "/repo/.sqlite",
    databaseFile: "division-challenge.sqlite3",
    databasePath: "/repo/.sqlite/division-challenge.sqlite3",
  }),
  storageLocationImpl = () => ({
    kind: "r2",
    bucket: "dino-rewards",
    endpoint: "https://acct.r2.cloudflarestorage.com",
    publicBaseUrl: "https://img.example.com",
    keyPrefix: "rewards",
    directory: null,
  }),
} = {}) {
  const listCallbackName = `__rewardsCacheList_${Math.random().toString(16).slice(2)}`;
  const getCallbackName = `__rewardsCacheGet_${Math.random().toString(16).slice(2)}`;
  const historyCallbackName = `__rewardsCacheHistory_${Math.random().toString(16).slice(2)}`;
  const deleteCallbackName = `__rewardsCacheDelete_${Math.random().toString(16).slice(2)}`;
  const locationCallbackName = `__rewardsCacheLocation_${Math.random().toString(16).slice(2)}`;
  const storageLocationCallbackName = `__rewardsStorageLocation_${Math.random().toString(16).slice(2)}`;
  globalThis[listCallbackName] = listRecordsImpl;
  globalThis[getCallbackName] = getRecordImpl;
  globalThis[historyCallbackName] = listHistoryImpl;
  globalThis[deleteCallbackName] = deleteEntryImpl;
  globalThis[locationCallbackName] = databaseLocationImpl;
  globalThis[storageLocationCallbackName] = storageLocationImpl;

  const nextServerModuleUrl = toDataUrl(`
    export const NextResponse = {
      json(body, init = {}) {
        return new Response(JSON.stringify(body), {
          status: init.status ?? 200,
          headers: { "content-type": "application/json" },
        });
      },
    };
  `);

  const imageCacheModuleUrl = toDataUrl(`
    export async function listRewardImageCacheDatabaseRecords() {
      return await globalThis.${listCallbackName}();
    }

    export async function getRewardImageCacheDatabaseRecord(dinosaurName) {
      return await globalThis.${getCallbackName}(dinosaurName);
    }

    export async function listRewardImageHistory(dinosaurName) {
      return await globalThis.${historyCallbackName}(dinosaurName);
    }

    export async function deleteRewardImageCacheEntry(dinosaurName) {
      return await globalThis.${deleteCallbackName}(dinosaurName);
    }

    export function getRewardCacheDatabaseLocation() {
      return globalThis.${locationCallbackName}();
    }
  `);

  const objectStorageModuleUrl = toDataUrl(`
    export function getRewardImageStorageLocation() {
      return globalThis.${storageLocationCallbackName}();
    }
  `);

  const routeModuleUrl = await transpileTypeScriptToDataUrl(
    "src/app/api/rewards/cache/route.ts",
    {
      "next/server": nextServerModuleUrl,
      "@/features/rewards/lib/reward-image-cache": imageCacheModuleUrl,
      "@/features/persistence/lib/object-storage": objectStorageModuleUrl,
    },
  );
  const routeModule = await import(routeModuleUrl);

  return {
    routeModule,
    cleanup: () => {
      delete globalThis[listCallbackName];
      delete globalThis[getCallbackName];
      delete globalThis[historyCallbackName];
      delete globalThis[deleteCallbackName];
      delete globalThis[locationCallbackName];
      delete globalThis[storageLocationCallbackName];
    },
  };
}

test("GET /api/rewards/cache returns database + storage location and records", async () => {
  const records = [
    {
      slug: "stegosaurus",
      dinosaurName: "Stegosaurus",
      status: "ready",
      statusUpdatedAtMs: 123,
      imageId: "123-abc",
      prompt: "prompt",
      model: "model",
      mimeType: "image/png",
      extension: "png",
      storageKey: "rewards/stegosaurus/123-abc.png",
      byteSize: 10,
      sha256: "deadbeef",
      source: "openai",
      imagePath: "https://img.example.com/rewards/stegosaurus/123-abc.png",
      updatedAtMs: 123,
    },
  ];
  const { routeModule, cleanup } = await loadRewardsCacheRoute({
    listRecordsImpl: async () => records,
  });

  try {
    const request = new Request("https://example.test/api/rewards/cache");
    const response = await routeModule.GET(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.count, 1);
    assert.deepEqual(body.data.records, records);
    assert.equal(body.data.database.databaseFile, "division-challenge.sqlite3");
    assert.equal(body.data.storage.kind, "r2");
    assert.equal(body.data.storage.bucket, "dino-rewards");
  } finally {
    cleanup();
  }
});

test("GET /api/rewards/cache?dinosaurName=... returns one record with its image history", async () => {
  let seenDinosaurName;
  const record = {
    slug: "tyrannosaurus-rex",
    dinosaurName: "Tyrannosaurus Rex",
    status: "ready",
    statusUpdatedAtMs: 999,
    imageId: "999-def",
    prompt: "prompt",
    model: "model",
    mimeType: "image/jpeg",
    extension: "jpg",
    storageKey: "rewards/tyrannosaurus-rex/999-def.jpg",
    byteSize: 20,
    sha256: "cafebabe",
    source: "openai",
    imagePath: "https://img.example.com/rewards/tyrannosaurus-rex/999-def.jpg",
    updatedAtMs: 999,
  };
  const history = [
    { id: "999-def", storageKey: "rewards/tyrannosaurus-rex/999-def.jpg" },
    { id: "500-abc", storageKey: "rewards/tyrannosaurus-rex/500-abc.png" },
  ];
  const { routeModule, cleanup } = await loadRewardsCacheRoute({
    getRecordImpl: async (dinosaurName) => {
      seenDinosaurName = dinosaurName;
      return record;
    },
    listHistoryImpl: async () => history,
  });

  try {
    const request = new Request(
      "https://example.test/api/rewards/cache?dinosaurName=Tyrannosaurus%20Rex",
    );
    const response = await routeModule.GET(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(seenDinosaurName, "Tyrannosaurus Rex");
    assert.deepEqual(body.data.record, record);
    assert.deepEqual(body.data.history, history);
  } finally {
    cleanup();
  }
});

test("DELETE /api/rewards/cache requires dinosaurName query parameter", async () => {
  const { routeModule, cleanup } = await loadRewardsCacheRoute();

  try {
    const request = new Request("https://example.test/api/rewards/cache", {
      method: "DELETE",
    });
    const response = await routeModule.DELETE(request);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.match(body.error.message, /dinosaurName query parameter/i);
  } finally {
    cleanup();
  }
});

test("DELETE /api/rewards/cache deletes one dinosaur cache entry", async () => {
  let seenDinosaurName;
  const { routeModule, cleanup } = await loadRewardsCacheRoute({
    deleteEntryImpl: async (dinosaurName) => {
      seenDinosaurName = dinosaurName;
      return {
        dinosaurName,
        deletedDatabaseRecord: true,
        deletedImageCount: 2,
        deletedStorageKeys: ["rewards/velociraptor/1-a.png", "rewards/velociraptor/2-b.png"],
      };
    },
  });

  try {
    const request = new Request(
      "https://example.test/api/rewards/cache?dinosaurName=Velociraptor",
      {
        method: "DELETE",
      },
    );
    const response = await routeModule.DELETE(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(seenDinosaurName, "Velociraptor");
    assert.deepEqual(body.data.deletedDatabaseRecord, true);
    assert.equal(body.data.deletedImageCount, 2);
    assert.equal(body.data.dinosaurName, "Velociraptor");
  } finally {
    cleanup();
  }
});
