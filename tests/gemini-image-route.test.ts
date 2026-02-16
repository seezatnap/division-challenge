import assert from "node:assert/strict";
import test from "node:test";

import { createGeminiImagePostHandler } from "../app/api/gemini-image/route";

test("gemini-image route returns 400 for invalid JSON", async () => {
  const handler = createGeminiImagePostHandler(
    async () => {
      throw new Error("should not be called");
    },
    async () => {
      throw new Error("should not be called");
    },
  );

  const response = await handler(new Request("http://localhost/api/gemini-image", {
    method: "POST",
    body: "{invalid-json",
    headers: {
      "content-type": "application/json",
    },
  }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    error: "Request body must be valid JSON.",
  });
});

test("gemini-image route returns 400 for missing dinosaurName", async () => {
  const handler = createGeminiImagePostHandler(
    async () => {
      throw new Error("should not be called");
    },
    async () => {
      throw new Error("should not be called");
    },
  );

  const response = await handler(new Request("http://localhost/api/gemini-image", {
    method: "POST",
    body: JSON.stringify({ dinosaurName: "   " }),
    headers: {
      "content-type": "application/json",
    },
  }));
  const body = await response.json();

  assert.equal(response.status, 400);
  assert.deepEqual(body, {
    error: "dinosaurName must be a non-empty string.",
  });
});

test("gemini-image route returns generated image payload", async () => {
  let requestedName: string | undefined;
  let persistedImagePath: string | undefined;

  const handler = createGeminiImagePostHandler(
    async ({ dinosaurName }) => {
      requestedName = dinosaurName;

      return {
        dinosaurName,
        model: "gemini-2.0-flash-exp",
        prompt: "cinematic prompt",
        mimeType: "image/png",
        data: "base64-data",
      };
    },
    async (image) => {
      assert.equal(image.dinosaurName, "Triceratops");
      assert.equal(image.mimeType, "image/png");
      assert.equal(image.data, "base64-data");
      persistedImagePath = "/generated-dinosaurs/triceratops-hash.png";

      return {
        imagePath: persistedImagePath,
        fileName: "triceratops-hash.png",
      };
    },
  );

  const response = await handler(new Request("http://localhost/api/gemini-image", {
    method: "POST",
    body: JSON.stringify({ dinosaurName: "  Triceratops " }),
    headers: {
      "content-type": "application/json",
    },
  }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(requestedName, "Triceratops");
  assert.deepEqual(body, {
    dinosaurName: "Triceratops",
    model: "gemini-2.0-flash-exp",
    prompt: "cinematic prompt",
    imagePath: "/generated-dinosaurs/triceratops-hash.png",
  });
  assert.equal(persistedImagePath, "/generated-dinosaurs/triceratops-hash.png");
});

test("gemini-image route returns 500 when generation fails", async () => {
  const handler = createGeminiImagePostHandler(
    async () => {
      throw new Error("Gemini unavailable");
    },
    async () => {
      throw new Error("should not be called");
    },
  );

  const response = await handler(new Request("http://localhost/api/gemini-image", {
    method: "POST",
    body: JSON.stringify({ dinosaurName: "Ankylosaurus" }),
    headers: {
      "content-type": "application/json",
    },
  }));
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: "Gemini unavailable",
  });
});

test("gemini-image route returns 500 when persistence fails", async () => {
  const handler = createGeminiImagePostHandler(
    async ({ dinosaurName }) => ({
      dinosaurName,
      model: "gemini-2.0-flash-exp",
      prompt: "cinematic prompt",
      mimeType: "image/png",
      data: "base64-data",
    }),
    async () => {
      throw new Error("Filesystem write failed");
    },
  );

  const response = await handler(new Request("http://localhost/api/gemini-image", {
    method: "POST",
    body: JSON.stringify({ dinosaurName: "Ankylosaurus" }),
    headers: {
      "content-type": "application/json",
    },
  }));
  const body = await response.json();

  assert.equal(response.status, 500);
  assert.deepEqual(body, {
    error: "Filesystem write failed",
  });
});
