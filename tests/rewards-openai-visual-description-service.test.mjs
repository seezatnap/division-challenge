import assert from "node:assert/strict";
import test from "node:test";

import { createJsonResponse, loadRewardsOpenAiModuleUrls } from "./helpers/rewards-module-loader.mjs";

const descriptionModule = loadRewardsOpenAiModuleUrls().then((urls) =>
  import(urls.visualDescriptionUrl),
);

const textConfig = { apiKey: "test-key", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna" };

function createResponsesPayload(text) {
  return {
    status: "completed",
    output: [
      { type: "reasoning", summary: [] },
      { type: "message", role: "assistant", content: [{ type: "output_text", text }] },
    ],
  };
}

test("buildVisualDescriptionPrompt briefs an exact species description for primary dinosaurs", async () => {
  const { buildVisualDescriptionPrompt } = await descriptionModule;

  const prompt = buildVisualDescriptionPrompt("Compsognathus", "Field dossier for Compsognathus: Length: 1 m.");

  assert.equal(prompt.subjectKind, "primary");
  assert.match(prompt.instructions, /paleontological art director/);
  assert.match(prompt.instructions, /exactly what the requested dinosaur looked like/);
  assert.match(prompt.instructions, /most often confused with/);
  assert.match(prompt.instructions, /no headings, no lists, no markdown/);
  assert.equal(
    prompt.input,
    "Dinosaur: Compsognathus. Reference dossier (use it for size and traits where it is consistent with the fossil record): Field dossier for Compsognathus: Length: 1 m.",
  );

  assert.equal(buildVisualDescriptionPrompt("Compsognathus", null).input, "Dinosaur: Compsognathus.");
  assert.throws(() => buildVisualDescriptionPrompt("   ", null), /assetName must be a non-empty string/);
});

test("buildVisualDescriptionPrompt designs a hypothetical cross for hybrid assets", async () => {
  const { buildVisualDescriptionPrompt } = await descriptionModule;

  const prompt = buildVisualDescriptionPrompt("Hybrid Stegosaurus + Velociraptor", null);

  assert.equal(prompt.subjectKind, "hybrid");
  assert.match(prompt.instructions, /creature designer/);
  assert.match(prompt.instructions, /hypothetical hybrid of the two named dinosaurs/);
  assert.match(prompt.instructions, /which features the hybrid inherits from which parent/);
  assert.equal(
    prompt.input,
    "Hybrid name: Hybrid Stegosaurus + Velociraptor. Parent species: Stegosaurus and Velociraptor.",
  );
});

test("generateOpenAiVisualDescription posts to /responses and returns the model's brief", async () => {
  const { generateOpenAiVisualDescription } = await descriptionModule;
  const seenRequests = [];

  const result = await generateOpenAiVisualDescription("Compsognathus", null, {
    getRequestConfig: () => textConfig,
    fetch: async (input, init) => {
      seenRequests.push({ input, init });
      return createJsonResponse(createResponsesPayload("  A turkey-sized theropod.  "));
    },
  });

  assert.equal(seenRequests.length, 1);
  assert.equal(seenRequests[0].input, "https://api.openai.com/v1/responses");
  assert.equal(seenRequests[0].init.headers.Authorization, "Bearer test-key");
  const body = JSON.parse(seenRequests[0].init.body);
  assert.equal(body.model, "gpt-5.6-luna");
  assert.equal(body.input, "Dinosaur: Compsognathus.");
  assert.match(body.instructions, /paleontological art director/);
  assert.equal(body.store, false);
  assert.ok(Number.isInteger(body.max_output_tokens) && body.max_output_tokens > 0);

  assert.equal(result.description, "A turkey-sized theropod.");
  assert.equal(result.model, "gpt-5.6-luna");
  assert.equal(result.subjectKind, "primary");
  assert.equal(result.assetName, "Compsognathus");
});

test("generateOpenAiVisualDescription maps config, transport, refusal, and empty failures", async () => {
  const { generateOpenAiVisualDescription, OpenAiVisualDescriptionError } = await descriptionModule;

  const expectCode = async (dependencies, code, messagePattern) => {
    await assert.rejects(
      generateOpenAiVisualDescription("Compsognathus", null, dependencies),
      (error) => {
        assert.ok(error instanceof OpenAiVisualDescriptionError, `expected description error, got ${error}`);
        assert.equal(error.code, code);
        if (messagePattern) {
          assert.match(error.message, messagePattern);
        }
        return true;
      },
    );
  };

  await expectCode(
    { getRequestConfig: () => { throw new Error("Missing OPENAI_API_KEY."); }, fetch: async () => null },
    "DESCRIPTION_CONFIG_ERROR",
  );
  await expectCode(
    { getRequestConfig: () => textConfig, fetch: async () => { throw new Error("socket hang up"); } },
    "DESCRIPTION_REQUEST_FAILED",
  );
  await expectCode(
    {
      getRequestConfig: () => textConfig,
      fetch: async () => createJsonResponse({ error: { message: "Rate limited" } }, 429),
    },
    "DESCRIPTION_REQUEST_FAILED",
    /Rate limited \(HTTP 429\)/,
  );
  await expectCode(
    {
      getRequestConfig: () => textConfig,
      fetch: async () =>
        createJsonResponse({
          output: [{ type: "message", content: [{ type: "refusal", refusal: "Nope." }] }],
        }),
    },
    "DESCRIPTION_RESPONSE_INVALID",
    /refused/,
  );
  await expectCode(
    { getRequestConfig: () => textConfig, fetch: async () => createJsonResponse({ output: [] }) },
    "DESCRIPTION_MISSING",
  );
  await expectCode(
    { getRequestConfig: () => textConfig, fetch: async () => createJsonResponse({}) },
    "DESCRIPTION_MISSING",
  );
});
