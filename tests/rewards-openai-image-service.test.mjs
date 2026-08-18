import assert from "node:assert/strict";
import test from "node:test";

import { createJsonResponse, loadRewardsOpenAiModuleUrls } from "./helpers/rewards-module-loader.mjs";

const modules = loadRewardsOpenAiModuleUrls().then(async (urls) => ({
  imageService: await import(urls.openAiImageServiceUrl),
  rewardImageService: await import(urls.rewardImageServiceUrl),
}));

const testConfig = {
  apiKey: "test-key",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-image-2",
  size: "1536x1024",
  quality: "medium",
};

test("buildOpenAiImageGenerationRequestBody targets gpt-image-2 with png output", async () => {
  const { imageService, rewardImageService } = await modules;

  assert.deepEqual(
    imageService.buildOpenAiImageGenerationRequestBody(testConfig, "  cinematic Triceratops  "),
    {
      model: "gpt-image-2",
      prompt: "cinematic Triceratops",
      n: 1,
      size: "1536x1024",
      quality: "medium",
      output_format: "png",
    },
  );

  assert.throws(
    () => imageService.buildOpenAiImageGenerationRequestBody(testConfig, "   "),
    (error) =>
      error instanceof rewardImageService.RewardImageGenerationError &&
      error.code === "IMAGE_PROMPT_ERROR",
  );
});

test("extractImageDataFromOpenAiResponse reads b64_json and maps output formats", async () => {
  const { imageService, rewardImageService } = await modules;

  assert.deepEqual(
    imageService.extractImageDataFromOpenAiResponse({ data: [{ b64_json: "YW Jj\nZA==" }] }),
    { imageBase64: "YWJjZA==", mimeType: "image/png" },
  );
  assert.equal(
    imageService.extractImageDataFromOpenAiResponse({
      output_format: "jpeg",
      data: [{ b64_json: "YWJjZA==" }],
    }).mimeType,
    "image/jpeg",
  );

  const expectCode = (payload, code) =>
    assert.throws(
      () => imageService.extractImageDataFromOpenAiResponse(payload),
      (error) =>
        error instanceof rewardImageService.RewardImageGenerationError && error.code === code,
    );
  expectCode(null, "IMAGE_RESPONSE_INVALID");
  expectCode({ data: "nope" }, "IMAGE_RESPONSE_INVALID");
  expectCode({ data: [{ revised_prompt: "x" }] }, "IMAGE_MISSING");
  expectCode({ data: [{ b64_json: "!!!" }] }, "IMAGE_DATA_INVALID");
});

test("generateOpenAiDinosaurImage posts the built prompt to /images/generations and returns the image", async () => {
  const { imageService } = await modules;
  const seenRequests = [];
  const seenPromptArgs = [];

  const result = await imageService.generateOpenAiDinosaurImage(
    {
      dinosaurName: "Triceratops",
      dossierPromptBlock: "Field dossier for Triceratops.",
      visualDescription: "Three horns and a solid frill.",
    },
    {
      getRequestConfig: () => testConfig,
      buildPrompt: (dinosaurName, dossierPromptBlock, visualDescription) => {
        seenPromptArgs.push([dinosaurName, dossierPromptBlock, visualDescription]);
        return `cinematic ${dinosaurName} | ${visualDescription} | ${dossierPromptBlock}`;
      },
      fetch: async (input, init) => {
        seenRequests.push({ input, init });
        return createJsonResponse({ data: [{ b64_json: "YWJjZA==" }] });
      },
    },
  );

  assert.deepEqual(seenPromptArgs, [
    ["Triceratops", "Field dossier for Triceratops.", "Three horns and a solid frill."],
  ]);
  assert.equal(seenRequests.length, 1);
  assert.equal(seenRequests[0].input, "https://api.openai.com/v1/images/generations");
  assert.equal(seenRequests[0].init.headers.Authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(seenRequests[0].init.body), {
    model: "gpt-image-2",
    prompt: "cinematic Triceratops | Three horns and a solid frill. | Field dossier for Triceratops.",
    n: 1,
    size: "1536x1024",
    quality: "medium",
    output_format: "png",
  });
  assert.deepEqual(result, {
    dinosaurName: "Triceratops",
    prompt: "cinematic Triceratops | Three horns and a solid frill. | Field dossier for Triceratops.",
    model: "gpt-image-2",
    mimeType: "image/png",
    imageBase64: "YWJjZA==",
  });
});

test("generateOpenAiDinosaurImage honors modelOverride and maps failures to explicit codes", async () => {
  const { imageService, rewardImageService } = await modules;
  const okFetch = async () => createJsonResponse({ data: [{ b64_json: "YWJjZA==" }] });
  const buildPrompt = (name) => `cinematic ${name}`;

  const overridden = await imageService.generateOpenAiDinosaurImage(
    { dinosaurName: "Triceratops", modelOverride: "gpt-image-2-hd" },
    { getRequestConfig: () => testConfig, buildPrompt, fetch: okFetch },
  );
  assert.equal(overridden.model, "gpt-image-2-hd");

  const expectCode = async (dependencies, code) => {
    await assert.rejects(
      imageService.generateOpenAiDinosaurImage({ dinosaurName: "Triceratops" }, dependencies),
      (error) =>
        error instanceof rewardImageService.RewardImageGenerationError && error.code === code,
    );
  };

  await expectCode(
    { getRequestConfig: () => { throw new Error("Missing OPENAI_API_KEY."); }, buildPrompt, fetch: okFetch },
    "IMAGE_CONFIG_ERROR",
  );
  await expectCode(
    { getRequestConfig: () => ({ ...testConfig, apiKey: "  " }), buildPrompt, fetch: okFetch },
    "IMAGE_CONFIG_ERROR",
  );
  await expectCode(
    { getRequestConfig: () => testConfig, buildPrompt: () => { throw new Error("bad prompt"); }, fetch: okFetch },
    "IMAGE_PROMPT_ERROR",
  );
  await expectCode(
    { getRequestConfig: () => testConfig, buildPrompt, fetch: async () => { throw new Error("socket hang up"); } },
    "IMAGE_REQUEST_FAILED",
  );
  await assert.rejects(
    imageService.generateOpenAiDinosaurImage(
      { dinosaurName: "Triceratops" },
      {
        getRequestConfig: () => testConfig,
        buildPrompt,
        fetch: async () =>
          createJsonResponse({ error: { message: "Organization not verified", code: "unverified" } }, 403),
      },
    ),
    (error) =>
      error.code === "IMAGE_REQUEST_FAILED" &&
      /Organization not verified \(code: unverified, HTTP 403\)/.test(error.message),
  );
  await expectCode(
    { getRequestConfig: () => testConfig, buildPrompt, fetch: async () => createJsonResponse({ data: [] }) },
    "IMAGE_MISSING",
  );
});
