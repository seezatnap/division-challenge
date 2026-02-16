import assert from "node:assert/strict";
import test from "node:test";

import {
  GEMINI_IMAGE_MODEL,
  buildJurassicParkImagePrompt,
  generateGeminiDinosaurImage,
  type GenerativeModelLike,
} from "../lib/gemini-image-service";

test("buildJurassicParkImagePrompt includes dinosaur name and cinematic constraints", () => {
  const prompt = buildJurassicParkImagePrompt("Velociraptor");

  assert.match(prompt, /Velociraptor/);
  assert.match(prompt, /Jurassic Park and Jurassic World/);
  assert.match(prompt, /cinematic, photorealistic/);
  assert.match(prompt, /No text, no watermark/);
});

test("buildJurassicParkImagePrompt rejects blank dinosaur names", () => {
  assert.throws(
    () => buildJurassicParkImagePrompt("    "),
    /Dinosaur name is required/,
  );
});

test("generateGeminiDinosaurImage parses inline image data from Gemini response", async () => {
  let capturedRequest: unknown;

  const fakeModelClient: GenerativeModelLike = {
    async generateContent(request) {
      capturedRequest = request;

      return {
        response: {
          candidates: [
            {
              index: 0,
              content: {
                role: "model",
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: "base64-image-bytes",
                    },
                  },
                ],
              },
            },
          ],
        },
      };
    },
  };

  const result = await generateGeminiDinosaurImage({
    dinosaurName: "  Tyrannosaurus Rex  ",
    modelClient: fakeModelClient,
  });

  assert.equal(result.dinosaurName, "Tyrannosaurus Rex");
  assert.equal(result.model, GEMINI_IMAGE_MODEL);
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.data, "base64-image-bytes");

  assert.deepEqual(capturedRequest, {
    contents: [
      {
        role: "user",
        parts: [{ text: result.prompt }],
      },
    ],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  });
});

test("generateGeminiDinosaurImage uses GEMINI_API_KEY when creating a model client", async () => {
  const previousApiKey = process.env.GEMINI_API_KEY;
  let capturedApiKey: string | undefined;
  let capturedModel: string | undefined;

  process.env.GEMINI_API_KEY = "  env-gemini-key  ";

  try {
    await generateGeminiDinosaurImage({
      dinosaurName: "Brachiosaurus",
      createModelClient(apiKey, model) {
        capturedApiKey = apiKey;
        capturedModel = model;

        return {
          async generateContent() {
            return {
              response: {
                candidates: [
                  {
                    index: 0,
                    content: {
                      role: "model",
                      parts: [
                        {
                          inlineData: {
                            mimeType: "image/webp",
                            data: "img-data",
                          },
                        },
                      ],
                    },
                  },
                ],
              },
            };
          },
        };
      },
    });
  } finally {
    if (typeof previousApiKey === "undefined") {
      delete process.env.GEMINI_API_KEY;
    } else {
      process.env.GEMINI_API_KEY = previousApiKey;
    }
  }

  assert.equal(capturedApiKey, "env-gemini-key");
  assert.equal(capturedModel, GEMINI_IMAGE_MODEL);
});

test("generateGeminiDinosaurImage throws when no inline image is returned", async () => {
  const fakeModelClient: GenerativeModelLike = {
    async generateContent() {
      return {
        response: {
          candidates: [
            {
              index: 0,
              content: {
                role: "model",
                parts: [{ text: "No image available." }],
              },
            },
          ],
        },
      };
    },
  };

  await assert.rejects(
    () =>
      generateGeminiDinosaurImage({
        dinosaurName: "Stegosaurus",
        modelClient: fakeModelClient,
      }),
    /did not return an inline image payload/,
  );
});
