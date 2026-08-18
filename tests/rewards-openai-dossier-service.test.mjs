import assert from "node:assert/strict";
import test from "node:test";

import { createJsonResponse, loadRewardsOpenAiModuleUrls } from "./helpers/rewards-module-loader.mjs";

const dossierModule = loadRewardsOpenAiModuleUrls().then((urls) => import(urls.dossierServiceUrl));

const textConfig = { apiKey: "test-key", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna" };

test("buildOpenAiDossierRequestBody requests strict JSON-schema output from the text model", async () => {
  const { buildOpenAiDossierRequestBody, buildDossierPrompt, DOSSIER_RESPONSE_JSON_SCHEMA } =
    await dossierModule;

  const body = buildOpenAiDossierRequestBody("gpt-5.6-luna", buildDossierPrompt("Velociraptor"));

  assert.equal(body.model, "gpt-5.6-luna");
  assert.equal(body.input, 'Create the dossier for the dinosaur "Velociraptor".');
  assert.match(body.instructions, /paleontology reference writer/);
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema, DOSSIER_RESPONSE_JSON_SCHEMA);
  // Strict mode: every property required, no extras.
  assert.deepEqual(
    [...DOSSIER_RESPONSE_JSON_SCHEMA.required].sort(),
    Object.keys(DOSSIER_RESPONSE_JSON_SCHEMA.properties).sort(),
  );
  assert.equal(DOSSIER_RESPONSE_JSON_SCHEMA.additionalProperties, false);

  assert.equal(
    buildDossierPrompt("Hybrid Tyrannosaurus Rex + Velociraptor"),
    'Create the dossier for "Hybrid Tyrannosaurus Rex + Velociraptor", a hybrid derived from Tyrannosaurus Rex and Velociraptor.',
  );
});

test("generateOpenAiRewardDossier parses the JSON reply and normalizes the payload", async () => {
  const { generateOpenAiRewardDossier } = await dossierModule;
  const seenRequests = [];

  const generated = await generateOpenAiRewardDossier("Hybrid Tyrannosaurus Rex + Velociraptor", {
    getRequestConfig: () => textConfig,
    fetch: async (input, init) => {
      seenRequests.push({ input, init });
      return createJsonResponse({
        output: [
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: JSON.stringify({
                  subjectName: "Hybrid Tyrannosaurus Rex + Velociraptor",
                  heightMeters: 8.4,
                  lengthMeters: 13.9,
                  attributes: [
                    "adaptive gait balancing",
                    "cross-species sensory fusion",
                    "reinforced cartilage weave",
                  ],
                  description: "A balanced hybrid apex profile tuned for pursuit and ambush.",
                  sourceDinosaurs: ["Tyrannosaurus Rex", "Velociraptor"],
                }),
              },
            ],
          },
        ],
      });
    },
  });

  assert.equal(seenRequests.length, 1);
  assert.equal(seenRequests[0].input, "https://api.openai.com/v1/responses");
  assert.equal(generated.model, "gpt-5.6-luna");
  assert.equal(generated.dossier.kind, "hybrid");
  assert.equal(generated.dossier.heightMeters, 8.4);
  assert.equal(generated.dossier.lengthMeters, 13.9);
  assert.deepEqual(generated.dossier.sourceDinosaurs, ["Tyrannosaurus Rex", "Velociraptor"]);
  assert.equal(
    generated.dossier.description,
    "A balanced hybrid apex profile tuned for pursuit and ambush.",
  );
});

test("generateOpenAiRewardDossier falls back to catalog values for malformed fields and reports API errors", async () => {
  const { generateOpenAiRewardDossier, normalizeOpenAiDossierPayload } = await dossierModule;

  const normalized = normalizeOpenAiDossierPayload("Velociraptor", {
    subjectName: "Velociraptor",
    heightMeters: "tall",
    lengthMeters: -4,
    attributes: ["only one"],
    description: "",
    sourceDinosaurs: null,
  });
  assert.equal(normalized.kind, "primary");
  assert.ok(normalized.heightMeters > 0);
  assert.equal(normalized.lengthMeters, 0.1);
  assert.ok(normalized.attributes.length >= 3);
  assert.ok(normalized.description.length > 0);
  assert.equal(normalized.sourceDinosaurs, null);

  await assert.rejects(
    generateOpenAiRewardDossier("Velociraptor", {
      getRequestConfig: () => textConfig,
      fetch: async () => createJsonResponse({ error: { message: "Bad key" } }, 401),
    }),
    /OpenAI dossier request failed: Bad key \(HTTP 401\)/,
  );
  await assert.rejects(
    generateOpenAiRewardDossier("Velociraptor", {
      getRequestConfig: () => textConfig,
      fetch: async () => createJsonResponse({ output: [] }),
    }),
    /did not include JSON text/,
  );
});
