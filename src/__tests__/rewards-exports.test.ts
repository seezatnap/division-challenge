import {
  getGeminiConfig,
  GEMINI_MODEL,
  buildDinoPrompt,
} from "@/features/rewards";

describe("rewards feature public exports", () => {
  it("exports getGeminiConfig", () => {
    expect(typeof getGeminiConfig).toBe("function");
  });

  it("exports GEMINI_MODEL", () => {
    expect(GEMINI_MODEL).toBe("gemini-2.0-flash-exp");
  });

  it("exports buildDinoPrompt", () => {
    expect(typeof buildDinoPrompt).toBe("function");
  });
});
