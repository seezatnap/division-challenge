import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "..");

async function loadTypeScriptModule(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const source = await readFile(absolutePath, "utf8");

  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: absolutePath,
  }).outputText;

  return import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
}

const rewardsGeminiImageServiceModule = loadTypeScriptModule(
  "src/features/rewards/lib/gemini-image-service.ts",
);

test("parseGeminiImageGenerationRequest enforces a non-empty dinosaurName", async () => {
  const { parseGeminiImageGenerationRequest, GeminiImageGenerationError } =
    await rewardsGeminiImageServiceModule;

  assert.throws(
    () => parseGeminiImageGenerationRequest({ dinosaurName: "   " }),
    (error) => {
      assert.ok(error instanceof GeminiImageGenerationError);
      assert.equal(error.code, "INVALID_DINOSAUR_NAME");
      assert.equal(error.statusCode, 400);
      return true;
    },
  );

  const parsedRequest = parseGeminiImageGenerationRequest({ dinosaurName: " Velociraptor " });
  assert.deepEqual(parsedRequest, { dinosaurName: "Velociraptor" });

  const parsedRequestWithDossier = parseGeminiImageGenerationRequest({
    dinosaurName: " Velociraptor ",
    dossierPromptBlock: " Field dossier for Velociraptor... ",
  });
  assert.deepEqual(parsedRequestWithDossier, {
    dinosaurName: "Velociraptor",
    dossierPromptBlock: "Field dossier for Velociraptor...",
  });
});

test("extractInlineImageDataFromGeminiResponse finds inline data and normalizes whitespace", async () => {
  const { extractInlineImageDataFromGeminiResponse } = await rewardsGeminiImageServiceModule;

  const parsedImage = extractInlineImageDataFromGeminiResponse({
    candidates: [
      {
        content: {
          parts: [{ text: "Some explanation" }, { inlineData: { mimeType: "image/jpeg", data: " YWJjZA==\n" } }],
        },
      },
    ],
  });

  assert.deepEqual(parsedImage, {
    mimeType: "image/jpeg",
    imageBase64: "YWJjZA==",
  });
});

test("extractInlineImageDataFromGeminiResponse reports missing image bytes with finish reasons", async () => {
  const { extractInlineImageDataFromGeminiResponse, GeminiImageGenerationError } =
    await rewardsGeminiImageServiceModule;

  assert.throws(
    () =>
      extractInlineImageDataFromGeminiResponse({
        candidates: [
          {
            finishReason: "SAFETY",
            content: {
              parts: [{ text: "Blocked by safety policies" }],
            },
          },
        ],
        promptFeedback: {
          blockReason: "SAFETY",
          blockReasonMessage: "Image output blocked.",
        },
        text: "No image was generated",
      }),
    (error) => {
      assert.ok(error instanceof GeminiImageGenerationError);
      assert.equal(error.code, "GEMINI_IMAGE_MISSING");
      assert.equal(error.statusCode, 502);
      assert.match(error.message, /Finish reasons: SAFETY/);
      assert.match(error.message, /Block reason: SAFETY/);
      assert.match(error.message, /Response text preview/);
      return true;
    },
  );
});

test("extractInlineImageDataFromGeminiResponse supports the Gen AI data accessor fallback", async () => {
  const { extractInlineImageDataFromGeminiResponse } = await rewardsGeminiImageServiceModule;

  const parsedImage = extractInlineImageDataFromGeminiResponse({
    data: "YWJjZA==",
  });

  assert.deepEqual(parsedImage, {
    mimeType: "image/png",
    imageBase64: "YWJjZA==",
  });
});

test("generateGeminiDinosaurImage builds prompt, invokes model, and returns parsed image output", async () => {
  const { generateGeminiDinosaurImage } = await rewardsGeminiImageServiceModule;

  const recordedRequests = [];
  const dependencies = {
    getRequestConfig: () => ({ apiKey: "test-key", model: "gemini-2.0-flash-exp" }),
    buildPrompt: (dinosaurName) => `cinematic portrait of ${dinosaurName}`,
    createClient: (apiKey) => {
      assert.equal(apiKey, "test-key");

      return {
        models: {
          async generateContent(request) {
            recordedRequests.push(request);

            return {
              candidates: [
                {
                  content: {
                    parts: [{ inlineData: { data: "YWJjZA==", mimeType: "image/png" } }],
                  },
                },
              ],
            };
          },
        },
      };
    },
  };

  const result = await generateGeminiDinosaurImage({ dinosaurName: " Triceratops " }, dependencies);

  assert.deepEqual(recordedRequests, [
    {
      model: "gemini-2.0-flash-exp",
      config: {
        responseModalities: ["IMAGE"],
      },
      contents: [
        {
          role: "user",
          parts: [{ text: "cinematic portrait of Triceratops" }],
        },
      ],
    },
  ]);

  assert.deepEqual(result, {
    dinosaurName: "Triceratops",
    prompt: "cinematic portrait of Triceratops",
    model: "gemini-2.0-flash-exp",
    mimeType: "image/png",
    imageBase64: "YWJjZA==",
  });
});

test("generateGeminiDinosaurImage maps dependency failures to explicit error codes", async () => {
  const { generateGeminiDinosaurImage, GeminiImageGenerationError } =
    await rewardsGeminiImageServiceModule;

  await assert.rejects(
    async () =>
      generateGeminiDinosaurImage(
        { dinosaurName: "Tyrannosaurus Rex" },
        {
          getRequestConfig: () => {
            throw new Error("missing env");
          },
          buildPrompt: (dinosaurName) => dinosaurName,
          createClient: () => ({
            models: {
              async generateContent() {
                return { response: { candidates: [] } };
              },
            },
          }),
        },
      ),
    (error) => {
      assert.ok(error instanceof GeminiImageGenerationError);
      assert.equal(error.code, "GEMINI_CONFIG_ERROR");
      assert.equal(error.statusCode, 500);
      return true;
    },
  );
});

test("generateGeminiDinosaurImage maps upstream SDK failures to a request-failed error", async () => {
  const { generateGeminiDinosaurImage, GeminiImageGenerationError } =
    await rewardsGeminiImageServiceModule;

  await assert.rejects(
    async () =>
      generateGeminiDinosaurImage(
        { dinosaurName: "Allosaurus" },
        {
          getRequestConfig: () => ({ apiKey: "test-key", model: "gemini-2.0-flash-exp" }),
          buildPrompt: () => "prompt",
          createClient: () => ({
            models: {
              async generateContent() {
                throw new Error("upstream timeout");
              },
            },
          }),
        },
      ),
    (error) => {
      assert.ok(error instanceof GeminiImageGenerationError);
      assert.equal(error.code, "GEMINI_REQUEST_FAILED");
      assert.equal(error.statusCode, 502);
      return true;
    },
  );
});

test("toGeminiImageApiErrorResponse preserves known errors and masks unknown failures", async () => {
  const { GeminiImageGenerationError, toGeminiImageApiErrorResponse } =
    await rewardsGeminiImageServiceModule;

  const knownErrorResponse = toGeminiImageApiErrorResponse(
    new GeminiImageGenerationError("INVALID_REQUEST", "Bad request body.", 400),
  );

  assert.deepEqual(knownErrorResponse, {
    status: 400,
    body: {
      error: {
        code: "INVALID_REQUEST",
        message: "Bad request body.",
      },
    },
  });

  const unknownErrorResponse = toGeminiImageApiErrorResponse(new Error("boom"));
  assert.deepEqual(unknownErrorResponse, {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected server error while generating dinosaur image.",
      },
    },
  });
});
