import { describe, it, expect, afterEach } from "vitest";
import { getGeminiApiKey } from "../env";

describe("getGeminiApiKey", () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GEMINI_API_KEY = originalEnv;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("returns the key when GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "test-key-123";
    expect(getGeminiApiKey()).toBe("test-key-123");
  });

  it("throws when GEMINI_API_KEY is not set", () => {
    delete process.env.GEMINI_API_KEY;
    expect(() => getGeminiApiKey()).toThrow("GEMINI_API_KEY is not set");
  });

  it("throws when GEMINI_API_KEY is empty string", () => {
    process.env.GEMINI_API_KEY = "";
    expect(() => getGeminiApiKey()).toThrow("GEMINI_API_KEY is not set");
  });
});
