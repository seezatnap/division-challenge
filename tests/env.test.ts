import assert from "node:assert/strict";
import test from "node:test";

import { getGeminiApiKey, hasGeminiApiKey } from "../lib/env";

function makeEnv(values: Partial<NodeJS.ProcessEnv>): NodeJS.ProcessEnv {
  return {
    NODE_ENV: "test",
    ...values,
  };
}

test("getGeminiApiKey returns a trimmed key", () => {
  const key = getGeminiApiKey(makeEnv({
    GEMINI_API_KEY: "  abc123  ",
  }));

  assert.equal(key, "abc123");
});

test("getGeminiApiKey throws when GEMINI_API_KEY is missing", () => {
  assert.throws(() => getGeminiApiKey(makeEnv({})), {
    message:
      "Missing GEMINI_API_KEY. Add it to .env.local before using Gemini features.",
  });
});

test("hasGeminiApiKey reflects whether a key is configured", () => {
  assert.equal(hasGeminiApiKey(makeEnv({ GEMINI_API_KEY: "value" })), true);
  assert.equal(hasGeminiApiKey(makeEnv({ GEMINI_API_KEY: "   " })), false);
});
