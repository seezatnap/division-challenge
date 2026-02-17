import {
  getGeminiConfig,
  GEMINI_MODEL,
  buildDinoPrompt,
  dinoSlug,
  getDinoImageDir,
  ensureDinoImageDir,
  findCachedImage,
  saveDinoImage,
  generateDinoImageCached,
} from "@/features/rewards";

jest.mock("fs", () => ({
  existsSync: jest.fn(() => false),
  readdirSync: jest.fn(() => []),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

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

  it("exports dinoSlug", () => {
    expect(typeof dinoSlug).toBe("function");
  });

  it("exports getDinoImageDir", () => {
    expect(typeof getDinoImageDir).toBe("function");
  });

  it("exports ensureDinoImageDir", () => {
    expect(typeof ensureDinoImageDir).toBe("function");
  });

  it("exports findCachedImage", () => {
    expect(typeof findCachedImage).toBe("function");
  });

  it("exports saveDinoImage", () => {
    expect(typeof saveDinoImage).toBe("function");
  });

  it("exports generateDinoImageCached", () => {
    expect(typeof generateDinoImageCached).toBe("function");
  });
});
