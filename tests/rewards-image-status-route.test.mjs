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

async function loadImageStatusRoute(getGeminiRewardImageGenerationStatusImpl) {
  const callbackName = `__routeRewardImageStatus_${Math.random().toString(16).slice(2)}`;
  globalThis[callbackName] = getGeminiRewardImageGenerationStatusImpl;

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
    "src/features/rewards/lib/gemini-image-service.ts",
  );
  const serviceModule = await import(serviceModuleUrl);

  const imageCacheModuleUrl = toDataUrl(`
    export async function getGeminiRewardImageGenerationStatus(dinosaurName) {
      return await globalThis.${callbackName}(dinosaurName);
    }
  `);

  const routeModuleUrl = await transpileTypeScriptToDataUrl(
    "src/app/api/rewards/image-status/route.ts",
    {
      "next/server": nextServerModuleUrl,
      "@/features/rewards/lib/gemini-image-cache": imageCacheModuleUrl,
      "@/features/rewards/lib/gemini-image-service": serviceModuleUrl,
    },
  );
  const routeModule = await import(routeModuleUrl);

  return {
    routeModule,
    serviceModule,
    cleanup: () => {
      delete globalThis[callbackName];
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

test("GET /api/rewards/image-status maps known GeminiImageGenerationError failures", async () => {
  const { routeModule, serviceModule, cleanup } = await loadImageStatusRoute(async () => {
    throw new serviceModule.GeminiImageGenerationError(
      "GEMINI_REQUEST_FAILED",
      "Gemini image generation request failed.",
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
        code: "GEMINI_REQUEST_FAILED",
        message: "Gemini image generation request failed.",
      },
    });
  } finally {
    cleanup();
  }
});
