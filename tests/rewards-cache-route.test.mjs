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
  deleteEntryImpl = async () => ({
    dinosaurName: "Velociraptor",
    deletedDatabaseRecord: true,
  }),
  databaseLocationImpl = () => ({
    projectRoot: "/repo",
    sqliteDirectory: "/repo/.sqlite",
    databaseFile: "division-challenge.sqlite3",
    databasePath: "/repo/.sqlite/division-challenge.sqlite3",
  }),
} = {}) {
  const listCallbackName = `__rewardsCacheList_${Math.random().toString(16).slice(2)}`;
  const getCallbackName = `__rewardsCacheGet_${Math.random().toString(16).slice(2)}`;
  const deleteCallbackName = `__rewardsCacheDelete_${Math.random().toString(16).slice(2)}`;
  const locationCallbackName = `__rewardsCacheLocation_${Math.random().toString(16).slice(2)}`;
  globalThis[listCallbackName] = listRecordsImpl;
  globalThis[getCallbackName] = getRecordImpl;
  globalThis[deleteCallbackName] = deleteEntryImpl;
  globalThis[locationCallbackName] = databaseLocationImpl;

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

    export async function deleteRewardImageCacheEntry(dinosaurName) {
      return await globalThis.${deleteCallbackName}(dinosaurName);
    }

    export function getRewardCacheDatabaseLocation() {
      return globalThis.${locationCallbackName}();
    }
  `);

  const routeModuleUrl = await transpileTypeScriptToDataUrl(
    "src/app/api/rewards/cache/route.ts",
    {
      "next/server": nextServerModuleUrl,
      "@/features/rewards/lib/reward-image-cache": imageCacheModuleUrl,
    },
  );
  const routeModule = await import(routeModuleUrl);

  return {
    routeModule,
    cleanup: () => {
      delete globalThis[listCallbackName];
      delete globalThis[getCallbackName];
      delete globalThis[deleteCallbackName];
      delete globalThis[locationCallbackName];
    },
  };
}

test("GET /api/rewards/cache returns sqlite location and records", async () => {
  const records = [
    {
      slug: "stegosaurus",
      dinosaurName: "Stegosaurus",
      prompt: "prompt",
      model: "model",
      mimeType: "image/png",
      extension: "png",
      absoluteImagePath: "/repo/public/rewards/stegosaurus.png",
      imagePath: "/rewards/stegosaurus.png?v=123",
      updatedAtMs: 123,
      status: "ready",
      statusUpdatedAtMs: 123,
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
  } finally {
    cleanup();
  }
});

test("GET /api/rewards/cache?dinosaurName=... returns one record", async () => {
  let seenDinosaurName;
  const record = {
    slug: "tyrannosaurus-rex",
    dinosaurName: "Tyrannosaurus Rex",
    prompt: "prompt",
    model: "model",
    mimeType: "image/jpeg",
    extension: "jpg",
    absoluteImagePath: "/repo/public/rewards/tyrannosaurus-rex.jpg",
    imagePath: "/rewards/tyrannosaurus-rex.jpg?v=999",
    updatedAtMs: 999,
    status: "ready",
    statusUpdatedAtMs: 999,
  };
  const { routeModule, cleanup } = await loadRewardsCacheRoute({
    getRecordImpl: async (dinosaurName) => {
      seenDinosaurName = dinosaurName;
      return record;
    },
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
    assert.equal(body.data.dinosaurName, "Velociraptor");
  } finally {
    cleanup();
  }
});
