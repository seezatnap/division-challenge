import { getGeminiConfig, GEMINI_MODEL } from "@/features/rewards/gemini-config";

describe("GEMINI_MODEL constant", () => {
  it('equals "gemini-2.0-flash-exp"', () => {
    expect(GEMINI_MODEL).toBe("gemini-2.0-flash-exp");
  });
});

describe("getGeminiConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns config when GEMINI_API_KEY is set", () => {
    process.env.GEMINI_API_KEY = "test-key-123";
    const config = getGeminiConfig();

    expect(config).toEqual({
      apiKey: "test-key-123",
      model: "gemini-2.0-flash-exp",
    });
  });

  it("trims whitespace from the API key", () => {
    process.env.GEMINI_API_KEY = "  spaced-key  ";
    const config = getGeminiConfig();

    expect(config.apiKey).toBe("spaced-key");
  });

  it("throws when GEMINI_API_KEY is not set", () => {
    delete process.env.GEMINI_API_KEY;

    expect(() => getGeminiConfig()).toThrow("GEMINI_API_KEY is not set");
  });

  it("throws when GEMINI_API_KEY is empty string", () => {
    process.env.GEMINI_API_KEY = "";

    expect(() => getGeminiConfig()).toThrow("GEMINI_API_KEY is not set");
  });

  it("throws when GEMINI_API_KEY is only whitespace", () => {
    process.env.GEMINI_API_KEY = "   ";

    expect(() => getGeminiConfig()).toThrow("GEMINI_API_KEY is not set");
  });
});
