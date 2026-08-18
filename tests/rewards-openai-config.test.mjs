import assert from "node:assert/strict";
import test from "node:test";

import { createJsonResponse, transpileTypeScriptToDataUrl } from "./helpers/rewards-module-loader.mjs";

const openAiModule = transpileTypeScriptToDataUrl("src/features/rewards/lib/openai.ts").then(
  (url) => import(url),
);

test("createOpenAiTextRequestConfig defaults to gpt-5.6-luna with a trimmed API key", async () => {
  const { createOpenAiTextRequestConfig, OPENAI_TEXT_MODEL_DEFAULT, OPENAI_BASE_URL_DEFAULT } =
    await openAiModule;

  const config = createOpenAiTextRequestConfig({ OPENAI_API_KEY: "  secret-value  " });

  assert.equal(config.apiKey, "secret-value");
  assert.equal(config.model, OPENAI_TEXT_MODEL_DEFAULT);
  assert.equal(OPENAI_TEXT_MODEL_DEFAULT, "gpt-5.6-luna");
  assert.equal(config.baseUrl, OPENAI_BASE_URL_DEFAULT);
});

test("createOpenAiImageRequestConfig defaults to gpt-image-2 and honors overrides", async () => {
  const { createOpenAiImageRequestConfig, OPENAI_IMAGE_MODEL_DEFAULT } = await openAiModule;

  const defaults = createOpenAiImageRequestConfig({ OPENAI_API_KEY: "secret-value" });
  assert.equal(defaults.model, "gpt-image-2");
  assert.equal(defaults.model, OPENAI_IMAGE_MODEL_DEFAULT);
  assert.equal(defaults.size, "1536x1024");
  assert.equal(defaults.quality, "medium");

  const overridden = createOpenAiImageRequestConfig({
    OPENAI_API_KEY: "secret-value",
    OPENAI_IMAGE_MODEL: " gpt-image-2-preview ",
    OPENAI_IMAGE_SIZE: "1024x1024",
    OPENAI_IMAGE_QUALITY: "high",
    OPENAI_BASE_URL: "https://proxy.example.test/v1/",
  });
  assert.equal(overridden.model, "gpt-image-2-preview");
  assert.equal(overridden.size, "1024x1024");
  assert.equal(overridden.quality, "high");
  assert.equal(overridden.baseUrl, "https://proxy.example.test/v1");
});

test("getOpenAiApiKey throws when OPENAI_API_KEY is missing", async () => {
  const { getOpenAiApiKey } = await openAiModule;

  assert.throws(() => getOpenAiApiKey({}), /Missing OPENAI_API_KEY\. Set OPENAI_API_KEY in \.env\.local/);
  assert.throws(() => getOpenAiApiKey({ OPENAI_API_KEY: "   " }), /Missing OPENAI_API_KEY/);
});

test("postOpenAiJson sends a bearer-authenticated JSON POST and returns status + payload", async () => {
  const { postOpenAiJson } = await openAiModule;
  const seen = [];

  const result = await postOpenAiJson(
    async (input, init) => {
      seen.push({ input, init });
      return createJsonResponse({ ok: true }, 200);
    },
    { apiKey: "secret-value", baseUrl: "https://api.openai.com/v1" },
    "/responses",
    { model: "gpt-5.6-luna", input: "hi" },
  );

  assert.deepEqual(result, { ok: true, status: 200, payload: { ok: true } });
  assert.equal(seen[0].input, "https://api.openai.com/v1/responses");
  assert.equal(seen[0].init.method, "POST");
  assert.equal(seen[0].init.headers.Authorization, "Bearer secret-value");
  assert.equal(seen[0].init.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(seen[0].init.body), { model: "gpt-5.6-luna", input: "hi" });

  const failed = await postOpenAiJson(
    async () => ({ ok: false, status: 429, json: async () => { throw new Error("no json"); } }),
    { apiKey: "secret-value", baseUrl: "https://api.openai.com/v1" },
    "/responses",
    {},
  );
  assert.deepEqual(failed, { ok: false, status: 429, payload: null });
});

test("extractOpenAiResponsesOutputText reads message output_text and surfaces refusals", async () => {
  const { extractOpenAiResponsesOutputText, describeOpenAiErrorPayload } = await openAiModule;

  assert.equal(
    extractOpenAiResponsesOutputText({
      output: [
        { type: "reasoning", summary: [] },
        {
          type: "message",
          role: "assistant",
          content: [
            { type: "output_text", text: " A stocky ceratopsian " },
            { type: "output_text", text: "with a bony frill." },
          ],
        },
      ],
    }),
    "A stocky ceratopsian\nwith a bony frill.",
  );
  assert.equal(extractOpenAiResponsesOutputText({ output_text: " direct " }), "direct");
  assert.equal(extractOpenAiResponsesOutputText({ output: [] }), null);
  assert.equal(extractOpenAiResponsesOutputText("nope"), null);
  assert.throws(
    () =>
      extractOpenAiResponsesOutputText({
        output: [{ type: "message", content: [{ type: "refusal", refusal: "Not allowed." }] }],
      }),
    /OpenAI refused the request: Not allowed\./,
  );

  assert.equal(
    describeOpenAiErrorPayload({ error: { message: "Rate limited", code: "rate_limit" } }, 429),
    "Rate limited (code: rate_limit, HTTP 429)",
  );
  assert.equal(describeOpenAiErrorPayload(null, 500), "OpenAI request failed with HTTP 500.");
});
