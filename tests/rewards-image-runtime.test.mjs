import assert from "node:assert/strict";
import test from "node:test";

import {
  createJsonResponse,
  loadRewardsOpenAiModuleUrls,
  toDataUrl,
  transpileTypeScriptToDataUrl,
} from "./helpers/rewards-module-loader.mjs";

/**
 * Loads the runtime with the reward image cache stubbed out: the cache simply
 * invokes the supplied generator so the two-stage pipeline can be observed.
 */
const runtimeModule = loadRewardsOpenAiModuleUrls().then(async (urls) => {
  const cacheStubUrl = toDataUrl(`
    export async function resolveRewardImageWithCache(request, generate) {
      return await generate(request);
    }
  `);
  const runtimeUrl = await transpileTypeScriptToDataUrl(
    "src/features/rewards/lib/reward-image-runtime.ts",
    {
      "./dino-dossiers": urls.dossiersUrl,
      "./fallback-reward-image": urls.fallbackImageUrl,
      "./reward-image-cache": cacheStubUrl,
      "./openai": urls.openAiUrl,
      "./openai-image-service": urls.openAiImageServiceUrl,
      "./openai-visual-description-service": urls.visualDescriptionUrl,
      "./reward-image-prompt": urls.promptUrl,
      "./reward-image-service": urls.rewardImageServiceUrl,
    },
  );

  return {
    runtime: await import(runtimeUrl),
    prompt: await import(urls.promptUrl),
  };
});

const textConfig = { apiKey: "test-key", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna" };
const imageConfig = {
  apiKey: "test-key",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-image-2",
  size: "1536x1024",
  quality: "medium",
};

function responsesText(text) {
  return createJsonResponse({
    output: [{ type: "message", content: [{ type: "output_text", text }] }],
  });
}

function createDependencies({ describeFetch, imageFetch, buildPrompt }) {
  return {
    description: { getRequestConfig: () => textConfig, fetch: describeFetch },
    image: {
      getRequestConfig: () => imageConfig,
      buildPrompt:
        buildPrompt ??
        ((assetName, dossierPromptBlock, visualDescription) =>
          `[${assetName}] desc=${visualDescription ?? "none"} dossier=${dossierPromptBlock ?? "none"}`),
      fetch: imageFetch,
    },
  };
}

test("generateRewardImage asks Luna for the exact description, then renders it with gpt-image-2", async () => {
  const { runtime } = await runtimeModule;
  const calls = [];

  const result = await runtime.generateRewardImage(
    { dinosaurName: "Compsognathus", dossierPromptBlock: "Field dossier for Compsognathus." },
    createDependencies({
      describeFetch: async (input, init) => {
        calls.push({ stage: "describe", input, body: JSON.parse(init.body) });
        return responsesText("A turkey-sized theropod with a long slender tail.");
      },
      imageFetch: async (input, init) => {
        calls.push({ stage: "image", input, body: JSON.parse(init.body) });
        return createJsonResponse({ data: [{ b64_json: "YWJjZA==" }] });
      },
    }),
  );

  assert.deepEqual(
    calls.map((call) => [call.stage, call.input]),
    [
      ["describe", "https://api.openai.com/v1/responses"],
      ["image", "https://api.openai.com/v1/images/generations"],
    ],
  );
  assert.equal(calls[0].body.model, "gpt-5.6-luna");
  assert.match(calls[0].body.input, /Dinosaur: Compsognathus\./);
  assert.match(calls[0].body.input, /Field dossier for Compsognathus\./);
  assert.equal(calls[1].body.model, "gpt-image-2");
  assert.equal(
    calls[1].body.prompt,
    "[Compsognathus] desc=A turkey-sized theropod with a long slender tail. dossier=Field dossier for Compsognathus.",
  );
  assert.equal(result.imageBase64, "YWJjZA==");
  assert.equal(result.model, "gpt-image-2");
  assert.equal(result.source, "openai");
  assert.equal(result.prompt, calls[1].body.prompt);
});

test("generateRewardImage designs hybrids with Luna before rendering", async () => {
  const { runtime, prompt } = await runtimeModule;
  const describeBodies = [];
  let imagePrompt = null;

  await runtime.generateRewardImage(
    { dinosaurName: "Hybrid Stegosaurus + Velociraptor" },
    createDependencies({
      buildPrompt: (assetName, dossierPromptBlock, visualDescription) =>
        prompt.buildRewardImagePrompt({ assetName, dossierPromptBlock, visualDescription }),
      describeFetch: async (_input, init) => {
        describeBodies.push(JSON.parse(init.body));
        return responsesText("Sickle claws beneath a double row of dorsal plates.");
      },
      imageFetch: async (_input, init) => {
        imagePrompt = JSON.parse(init.body).prompt;
        return createJsonResponse({ data: [{ b64_json: "YWJjZA==" }] });
      },
    }),
  );

  assert.equal(describeBodies.length, 1);
  assert.match(describeBodies[0].instructions, /hypothetical hybrid/);
  assert.match(describeBodies[0].input, /Parent species: Stegosaurus and Velociraptor\./);
  assert.match(imagePrompt, /Designed appearance of this hybrid/);
  assert.match(imagePrompt, /Sickle claws beneath a double row of dorsal plates\./);
});

test("generateRewardImage still renders from the dossier when the description call fails", async () => {
  const { runtime } = await runtimeModule;
  let imagePrompt = null;

  const result = await runtime.generateRewardImage(
    { dinosaurName: "Compsognathus" },
    createDependencies({
      describeFetch: async () => createJsonResponse({ error: { message: "Rate limited" } }, 429),
      imageFetch: async (_input, init) => {
        imagePrompt = JSON.parse(init.body).prompt;
        return createJsonResponse({ data: [{ b64_json: "YWJjZA==" }] });
      },
    }),
  );

  assert.equal(imagePrompt, "[Compsognathus] desc=none dossier=none");
  assert.equal(result.imageBase64, "YWJjZA==");
});

test("generateRewardImage skips the description stage for amber assets", async () => {
  const { runtime } = await runtimeModule;
  let describeCalls = 0;

  const result = await runtime.generateRewardImage(
    { dinosaurName: "Amber Resonance Crystal" },
    createDependencies({
      describeFetch: async () => {
        describeCalls += 1;
        return responsesText("should not be requested");
      },
      imageFetch: async () => createJsonResponse({ data: [{ b64_json: "YWJjZA==" }] }),
    }),
  );

  assert.equal(describeCalls, 0);
  assert.equal(result.prompt, "[Amber Resonance Crystal] desc=none dossier=none");
});

test("generateRewardImage falls back to the local SVG when the image provider fails", async () => {
  const { runtime } = await runtimeModule;

  const result = await runtime.generateRewardImage(
    { dinosaurName: "Compsognathus" },
    createDependencies({
      describeFetch: async () => responsesText("A turkey-sized theropod."),
      imageFetch: async () => createJsonResponse({ error: { message: "Server exploded" } }, 500),
    }),
  );

  assert.equal(result.dinosaurName, "Compsognathus");
  assert.equal(result.mimeType, "image/svg+xml");
  assert.equal(result.model, "local-fallback-svg");
  assert.equal(result.source, "fallback-svg");

  await assert.rejects(
    runtime.generateRewardImage({ dinosaurName: "   " }, createDependencies({
      describeFetch: async () => responsesText("x"),
      imageFetch: async () => createJsonResponse({ data: [] }),
    })),
    (error) => error.code === "INVALID_DINOSAUR_NAME",
  );
});
