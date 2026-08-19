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

async function loadImageStatusRoute(
  getRewardImageGenerationStatusImpl,
  getRewardImageGenerationStatusesImpl = async (dinosaurNames) =>
    dinosaurNames.map((dinosaurName) => ({ dinosaurName, status: "missing", imagePath: null })),
) {
  const callbackName = `__routeRewardImageStatus_${Math.random().toString(16).slice(2)}`;
  const bulkCallbackName = `__routeRewardImageStatuses_${Math.random().toString(16).slice(2)}`;
  globalThis[callbackName] = getRewardImageGenerationStatusImpl;
  globalThis[bulkCallbackName] = getRewardImageGenerationStatusesImpl;

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

  const serviceModuleUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/reward-image-service.ts",
  );
  const serviceModule = await import(serviceModuleUrl);

  const imageCacheModuleUrl = toDataUrl(`
    export async function getRewardImageGenerationStatus(dinosaurName) {
      return await globalThis.${callbackName}(dinosaurName);
    }

    export async function getRewardImageGenerationStatuses(dinosaurNames) {
      return await globalThis.${bulkCallbackName}(dinosaurNames);
    }
  `);

  const routeModuleUrl = await transpileTypeScriptToDataUrl(
    "src/app/api/rewards/image-status/route.ts",
    {
      "next/server": nextServerModuleUrl,
      "@/features/rewards/lib/reward-image-cache": imageCacheModuleUrl,
      "@/features/rewards/lib/reward-image-service": serviceModuleUrl,
    },
  );
  const routeModule = await import(routeModuleUrl);

  return {
    routeModule,
    serviceModule,
    cleanup: () => {
      delete globalThis[callbackName];
      delete globalThis[bulkCallbackName];
    },
  };
}

test("GET /api/rewards/image-status validates dinosaurName query parameter", async () => {
  const { routeModule, cleanup } = await loadImageStatusRoute(async () => {
    assert.fail("status lookup should not run when dinosaurName is missing");
  });

  try {
    const response = await routeModule.GET(
      new Request("https://example.test/api/rewards/image-status"),
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
      error: {
        code: "INVALID_DINOSAUR_NAME",
        message: "dinosaurName query parameter must be a non-empty string.",
      },
    });
  } finally {
    cleanup();
  }
});

test("GET /api/rewards/image-status returns image readiness snapshot", async () => {
  let seenDinosaurName = "";
  const { routeModule, cleanup } = await loadImageStatusRoute(async (dinosaurName) => {
    seenDinosaurName = dinosaurName;
    return {
      dinosaurName,
      status: "ready",
      imagePath: "/rewards/stegosaurus.png",
    };
  });

  try {
    const response = await routeModule.GET(
      new Request("https://example.test/api/rewards/image-status?dinosaurName=Stegosaurus"),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(seenDinosaurName, "Stegosaurus");
    assert.deepEqual(body, {
      data: {
        dinosaurName: "Stegosaurus",
        status: "ready",
        imagePath: "/rewards/stegosaurus.png",
      },
    });
  } finally {
    cleanup();
  }
});

test("GET /api/rewards/image-status maps known RewardImageGenerationError failures", async () => {
  const { routeModule, serviceModule, cleanup } = await loadImageStatusRoute(async () => {
    throw new serviceModule.RewardImageGenerationError(
      "IMAGE_REQUEST_FAILED",
      "OpenAI image generation request failed.",
      502,
    );
  });

  try {
    const response = await routeModule.GET(
      new Request("https://example.test/api/rewards/image-status?dinosaurName=Triceratops"),
    );
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.deepEqual(body, {
      error: {
        code: "IMAGE_REQUEST_FAILED",
        message: "OpenAI image generation request failed.",
      },
    });
  } finally {
    cleanup();
  }
});

test("GET /api/rewards/image-status returns many statuses from one request", async () => {
  let seenNames;
  const { routeModule, cleanup } = await loadImageStatusRoute(
    async () => {
      throw new Error("the single-name path must not be used for a bulk request");
    },
    async (dinosaurNames) => {
      seenNames = dinosaurNames;
      return dinosaurNames.map((dinosaurName, index) => ({
        dinosaurName,
        status: index === 0 ? "ready" : "missing",
        imagePath: index === 0 ? "/rewards/triceratops.jpg?v=1" : null,
      }));
    },
  );

  try {
    const request = new Request(
      "https://example.test/api/rewards/image-status?dinosaurNames=Triceratops&dinosaurNames=Hybrid%20A%20%2B%20B",
    );
    const response = await routeModule.GET(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(seenNames, ["Triceratops", "Hybrid A + B"]);
    assert.deepEqual(body.data.records, [
      { dinosaurName: "Triceratops", status: "ready", imagePath: "/rewards/triceratops.jpg?v=1" },
      { dinosaurName: "Hybrid A + B", status: "missing", imagePath: null },
    ]);
  } finally {
    cleanup();
  }
});

test("GET /api/rewards/image-status rejects an oversized bulk request", async () => {
  const { routeModule, cleanup } = await loadImageStatusRoute(async () => {
    throw new Error("should not be called");
  });

  try {
    const searchParams = new URLSearchParams();
    for (let index = 0; index < 201; index += 1) {
      searchParams.append("dinosaurNames", `Dino ${index}`);
    }

    const response = await routeModule.GET(
      new Request(`https://example.test/api/rewards/image-status?${searchParams.toString()}`),
    );

    assert.equal(response.status, 400);
    assert.match((await response.json()).error.message, /at most 200 names/);
  } finally {
    cleanup();
  }
});
