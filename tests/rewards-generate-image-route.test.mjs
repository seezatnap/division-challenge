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

async function loadGenerateImageRoute(generateGeminiRewardImageImpl) {
  const callbackName = `__routeGenerateImage_${Math.random().toString(16).slice(2)}`;
  globalThis[callbackName] = generateGeminiRewardImageImpl;

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

  const runtimeModuleUrl = toDataUrl(`
    export async function generateGeminiRewardImage(payload) {
      return await globalThis.${callbackName}(payload);
    }
  `);

  const routeModuleUrl = await transpileTypeScriptToDataUrl(
    "src/app/api/rewards/generate-image/route.ts",
    {
      "next/server": nextServerModuleUrl,
      "@/features/rewards/lib/gemini-image-runtime": runtimeModuleUrl,
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

test("POST /api/rewards/generate-image returns INVALID_REQUEST for malformed JSON", async () => {
  const { routeModule, cleanup } = await loadGenerateImageRoute(async () => {
    assert.fail("generateGeminiRewardImage should not be called for malformed JSON");
  });

  try {
    const request = new Request("https://example.test/api/rewards/generate-image", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: '{"dinosaurName": "Velociraptor"',
    });

    const response = await routeModule.POST(request);
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.deepEqual(body, {
      error: {
        code: "INVALID_REQUEST",
        message: "Request body must be valid JSON.",
      },
    });
  } finally {
    cleanup();
  }
});

test("POST /api/rewards/generate-image maps known GeminiImageGenerationError responses", async () => {
  let seenPayload;

  const { routeModule, serviceModule, cleanup } = await loadGenerateImageRoute(async (payload) => {
    seenPayload = payload;

    throw new serviceModule.GeminiImageGenerationError(
      "GEMINI_REQUEST_FAILED",
      "Gemini image generation request failed.",
      502,
    );
  });

  try {
    const request = new Request("https://example.test/api/rewards/generate-image", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ dinosaurName: "Triceratops" }),
    });

    const response = await routeModule.POST(request);
    const body = await response.json();

    assert.equal(response.status, 502);
    assert.deepEqual(seenPayload, { dinosaurName: "Triceratops" });
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

test("POST /api/rewards/generate-image wraps successful image output in a data envelope", async () => {
  const generatedImage = {
    dinosaurName: "Brachiosaurus",
    prompt: "cinematic portrait of Brachiosaurus",
    model: "gemini-2.0-flash-exp",
    mimeType: "image/png",
    imageBase64: "YWJjZA==",
  };

  let seenPayload;
  const { routeModule, cleanup } = await loadGenerateImageRoute(async (payload) => {
    seenPayload = payload;
    return generatedImage;
  });

  try {
    const request = new Request("https://example.test/api/rewards/generate-image", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ dinosaurName: "Brachiosaurus" }),
    });

    const response = await routeModule.POST(request);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(seenPayload, { dinosaurName: "Brachiosaurus" });
    assert.deepEqual(body, { data: generatedImage });
  } finally {
    cleanup();
  }
});
