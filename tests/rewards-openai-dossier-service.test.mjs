import assert from "node:assert/strict";
import test from "node:test";

import { createJsonResponse, loadRewardsOpenAiModuleUrls } from "./helpers/rewards-module-loader.mjs";

const dossierModule = loadRewardsOpenAiModuleUrls().then((urls) => import(urls.dossierServiceUrl));

const textConfig = { apiKey: "test-key", baseUrl: "https://api.openai.com/v1", model: "gpt-5.6-luna" };

test("the dossier request pins the model to prose and supplies verified facts", async () => {
  const { buildOpenAiDossierRequestBody, buildDossierPrompt, DOSSIER_RESPONSE_JSON_SCHEMA } =
    await dossierModule;

  const prompt = buildDossierPrompt("Velociraptor");
  const body = buildOpenAiDossierRequestBody("gpt-5.6-luna", prompt);

  assert.equal(body.model, "gpt-5.6-luna");
  assert.equal(body.store, false);
  assert.equal(body.text.format.type, "json_schema");
  assert.equal(body.text.format.strict, true);
  assert.equal(body.text.format.schema, DOSSIER_RESPONSE_JSON_SCHEMA);

  // The model writes prose only; the game supplies every fact it displays.
  assert.deepEqual(
    [...DOSSIER_RESPONSE_JSON_SCHEMA.required].sort(),
    ["attributes", "description"],
  );
  assert.deepEqual(
    Object.keys(DOSSIER_RESPONSE_JSON_SCHEMA.properties).sort(),
    ["attributes", "description"],
  );
  assert.equal(DOSSIER_RESPONSE_JSON_SCHEMA.additionalProperties, false);
  assert.match(body.instructions, /VERIFIED FACTS block/);
  assert.match(body.instructions, /never introduce measurements/i);

  // The prompt carries the curated ground truth.
  assert.match(prompt, /VERIFIED FACTS/);
  assert.match(prompt, /Scientific name: Velociraptor mongoliensis\./);
  assert.match(prompt, /Diet: Carnivore \(Meat-Eater\)\./);
  assert.match(prompt, /covered in feathers/);

  const hybridPrompt = buildDossierPrompt("Hybrid Tyrannosaurus Rex + Velociraptor");
  assert.match(hybridPrompt, /hybrid engineered in the InGen DNA lab from Tyrannosaurus Rex and Velociraptor/);
  assert.doesNotMatch(hybridPrompt, /imaginary/);
});

test("model output supplies prose only; curated facts are kept", async () => {
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
                  description: "A lab-spliced blend of two very different hunters.",
                  attributes: [
                    "adaptive gait balancing",
                    "cross-species sensory fusion",
                    "reinforced cartilage weave",
                  ],
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
  assert.equal(
    generated.dossier.description,
    "A lab-spliced blend of two very different hunters.",
  );
  // Hybrid dimensions stay the average of the two real parents.
  assert.equal(generated.dossier.heightMeters, 2.1);
  assert.equal(generated.dossier.lengthMeters, 7.2);
  assert.deepEqual(generated.dossier.sourceDinosaurs, ["Tyrannosaurus Rex", "Velociraptor"]);
  assert.equal(generated.dossier.infoCard, null);
});

test("a model that contradicts the facts cannot change what the game displays", async () => {
  const { generateOpenAiRewardDossier, normalizeOpenAiDossierPayload } = await dossierModule;

  // Every factual field below is wrong, and every one of them must be discarded.
  const normalized = normalizeOpenAiDossierPayload("Velociraptor", {
    subjectName: "Velociraptor",
    heightMeters: 99,
    lengthMeters: -4,
    attributes: ["six metres tall", "ate only fish"],
    description: "A feathered hunter about the size of a turkey.",
    sourceDinosaurs: ["made", "up"],
  });

  assert.equal(normalized.kind, "primary");
  assert.equal(normalized.heightMeters, 0.5);
  assert.equal(normalized.lengthMeters, 2);
  assert.equal(normalized.sourceDinosaurs, null);
  assert.equal(normalized.infoCard.scientificName, "Velociraptor mongoliensis");
  assert.equal(normalized.infoCard.weightKg, 15);
  assert.deepEqual([...normalized.attributes], [
    "sickle claw on each foot",
    "covered in feathers",
    "about the size of a turkey",
  ]);
  assert.equal(normalized.description, "A feathered hunter about the size of a turkey.");

  // An empty description falls back to the curated one.
  const emptyProse = normalizeOpenAiDossierPayload("Velociraptor", { description: "  " });
  assert.match(emptyProse.description, /^The real Velociraptor was about the size of a turkey/);

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
