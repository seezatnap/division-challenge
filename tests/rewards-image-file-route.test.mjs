import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { loadTypeScriptModule } from "../scripts/lib/load-typescript-module.mjs";

// Isolated database for this file (read lazily on first query).
const databaseDirectory = await mkdtemp(path.join(os.tmpdir(), "dino-reward-file-route-db-"));
process.env.TURSO_DATABASE_URL = `file:${path.join(databaseDirectory, "route.sqlite3")}`;

/**
 * Loads the `/rewards/[filename]` route with the default storage swapped for an
 * in-memory adapter (the route otherwise reads R2 / local-fallback config).
 */
async function loadRewardImageFileRoute() {
  const objectStorage = await loadTypeScriptModule("src/features/persistence/lib/object-storage.ts");
  const storage = objectStorage.createInMemoryRewardImageStorage();
  const callbackName = `__rewardFileRouteStorage_${Math.random().toString(16).slice(2)}`;
  globalThis[callbackName] = storage;

  const storageStubUrl = `data:text/javascript;base64,${Buffer.from(`
    export function getDefaultRewardImageStorage() {
      return globalThis.${callbackName};
    }
  `).toString("base64")}`;

  const [routeModule, rewardImageCache] = await Promise.all([
    loadTypeScriptModule("src/app/rewards/[filename]/route.ts", {
      replacements: { "@/features/persistence/lib/object-storage": storageStubUrl },
    }),
    loadTypeScriptModule("src/features/rewards/lib/reward-image-cache.ts"),
  ]);

  return {
    routeModule,
    rewardImageCache,
    storage,
    cleanup: () => {
      delete globalThis[callbackName];
    },
  };
}

test("GET /rewards/<slug>.<ext> streams the current image bytes from storage", async () => {
  const { routeModule, rewardImageCache, storage, cleanup } = await loadRewardImageFileRoute();

  try {
    const imageBytes = Buffer.from("fake-jpeg-bytes");
    const record = await rewardImageCache.persistRewardImage(
      {
        dinosaurName: "Tyrannosaurus Rex",
        prompt: "prompt",
        model: "gpt-image-2",
        mimeType: "image/jpeg",
        imageBase64: imageBytes.toString("base64"),
      },
      { storage },
    );

    // Legacy paths may carry a different extension than the current image; the
    // slug is what matters.
    const response = await routeModule.GET(new Request("https://example.test/rewards/tyrannosaurus-rex.png"), {
      params: Promise.resolve({ filename: "tyrannosaurus-rex.png" }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "image/jpeg");
    assert.equal(response.headers.get("x-reward-image-id"), record.id);
    assert.equal(response.headers.get("etag"), `"${record.sha256}"`);
    assert.match(response.headers.get("cache-control"), /max-age=3600/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), imageBytes);
  } finally {
    cleanup();
  }
});

test("GET /rewards/<file> returns 404 for unknown rewards, malformed names, and lost objects", async () => {
  const { routeModule, rewardImageCache, storage, cleanup } = await loadRewardImageFileRoute();

  try {
    const unknown = await routeModule.GET(new Request("https://example.test/rewards/nope.png"), {
      params: Promise.resolve({ filename: "nope.png" }),
    });
    assert.equal(unknown.status, 404);

    const malformed = await routeModule.GET(new Request("https://example.test/rewards/x"), {
      params: Promise.resolve({ filename: "..%2Fetc%2Fpasswd" }),
    });
    assert.equal(malformed.status, 404);

    const record = await rewardImageCache.persistRewardImage(
      {
        dinosaurName: "Gallimimus",
        prompt: "prompt",
        model: "gpt-image-2",
        mimeType: "image/png",
        imageBase64: Buffer.from("png").toString("base64"),
      },
      { storage },
    );
    storage.objects.delete(record.storageKey);

    const lost = await routeModule.GET(new Request("https://example.test/rewards/gallimimus.png"), {
      params: Promise.resolve({ filename: "gallimimus.png" }),
    });
    assert.equal(lost.status, 404);
  } finally {
    cleanup();
  }
});
