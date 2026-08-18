import assert from "node:assert/strict";
import test from "node:test";

import { transpileTypeScriptToDataUrl } from "./helpers/rewards-module-loader.mjs";

const serviceModule = transpileTypeScriptToDataUrl(
  "src/features/rewards/lib/reward-image-service.ts",
).then((url) => import(url));

test("parseRewardImageGenerationRequest enforces a non-empty dinosaurName", async () => {
  const { parseRewardImageGenerationRequest, RewardImageGenerationError } = await serviceModule;

  assert.throws(
    () => parseRewardImageGenerationRequest({ dinosaurName: "   " }),
    (error) => {
      assert.ok(error instanceof RewardImageGenerationError);
      assert.equal(error.code, "INVALID_DINOSAUR_NAME");
      assert.equal(error.statusCode, 400);
      return true;
    },
  );
  assert.throws(
    () => parseRewardImageGenerationRequest("nope"),
    (error) => error.code === "INVALID_REQUEST" && error.statusCode === 400,
  );

  assert.deepEqual(parseRewardImageGenerationRequest({ dinosaurName: " Velociraptor " }), {
    dinosaurName: "Velociraptor",
  });
  assert.deepEqual(
    parseRewardImageGenerationRequest({
      dinosaurName: " Velociraptor ",
      dossierPromptBlock: " Field dossier for Velociraptor... ",
      modelOverride: " gpt-image-2 ",
    }),
    {
      dinosaurName: "Velociraptor",
      modelOverride: "gpt-image-2",
      dossierPromptBlock: "Field dossier for Velociraptor...",
    },
  );
});

test("normalizeBase64ImageData strips whitespace and rejects invalid data", async () => {
  const { normalizeBase64ImageData, RewardImageGenerationError } = await serviceModule;

  assert.equal(normalizeBase64ImageData("YW Jj\nZA=="), "YWJjZA==");
  assert.throws(
    () => normalizeBase64ImageData("not base64!!"),
    (error) => error instanceof RewardImageGenerationError && error.code === "IMAGE_DATA_INVALID",
  );
});

test("toRewardImageApiErrorResponse preserves known errors and masks unknown failures", async () => {
  const { RewardImageGenerationError, toRewardImageApiErrorResponse } = await serviceModule;

  assert.deepEqual(
    toRewardImageApiErrorResponse(
      new RewardImageGenerationError("INVALID_REQUEST", "Bad request body.", 400),
    ),
    {
      status: 400,
      body: { error: { code: "INVALID_REQUEST", message: "Bad request body." } },
    },
  );

  assert.deepEqual(toRewardImageApiErrorResponse(new Error("boom")), {
    status: 500,
    body: {
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Unexpected server error while generating dinosaur image.",
      },
    },
  });
});
