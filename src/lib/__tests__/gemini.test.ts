import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildDinoPrompt, generateDinoImage } from "../gemini";

// Shared mock for generateContent — hoisted so it's the same reference
// used by generateDinoImage at runtime.
const mockGenerateContent = vi.fn();

vi.mock("@google/generative-ai", () => {
  // Use a class so `new GoogleGenerativeAI(...)` works
  class MockGoogleGenerativeAI {
    getGenerativeModel() {
      return { generateContent: mockGenerateContent };
    }
  }
  return { GoogleGenerativeAI: MockGoogleGenerativeAI };
});

vi.mock("../env", () => ({
  getGeminiApiKey: vi.fn(() => "test-api-key"),
}));

describe("buildDinoPrompt", () => {
  it("includes the dinosaur name", () => {
    const prompt = buildDinoPrompt("Tyrannosaurus Rex");
    expect(prompt).toContain("Tyrannosaurus Rex");
  });

  it("references Jurassic Park cinematic style", () => {
    const prompt = buildDinoPrompt("Velociraptor");
    expect(prompt).toMatch(/Jurassic Park/i);
    expect(prompt).toMatch(/cinematic/i);
  });

  it("requests photorealistic quality", () => {
    const prompt = buildDinoPrompt("Triceratops");
    expect(prompt).toMatch(/photorealistic/i);
  });

  it("includes environment details", () => {
    const prompt = buildDinoPrompt("Brachiosaurus");
    expect(prompt).toMatch(/jungle|foliage|tropical/i);
  });

  it("works with any dinosaur name", () => {
    const prompt = buildDinoPrompt("Indominus Rex");
    expect(prompt).toContain("Indominus Rex");
    expect(prompt).toMatch(/Jurassic Park/i);
  });
});

describe("generateDinoImage", () => {
  const originalEnv = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-api-key";
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.GEMINI_API_KEY = originalEnv;
    } else {
      delete process.env.GEMINI_API_KEY;
    }
  });

  it("returns base64 image data when Gemini returns an image", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: "dGVzdC1pbWFnZS1kYXRh",
                    mimeType: "image/png",
                  },
                },
              ],
            },
          },
        ],
      },
    });

    const result = await generateDinoImage("Velociraptor");

    expect(result.base64Data).toBe("dGVzdC1pbWFnZS1kYXRh");
    expect(result.mimeType).toBe("image/png");
  });

  it("extracts image from mixed text+image response", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [
          {
            content: {
              parts: [
                { text: "Here is your Spinosaurus image" },
                {
                  inlineData: {
                    data: "c3Bpbm8taW1hZ2U=",
                    mimeType: "image/png",
                  },
                },
              ],
            },
          },
        ],
      },
    });

    const result = await generateDinoImage("Spinosaurus");

    expect(result.base64Data).toBe("c3Bpbm8taW1hZ2U=");
    expect(result.mimeType).toBe("image/png");
  });

  it("throws when Gemini returns no candidates", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [],
      },
    });

    await expect(generateDinoImage("Stegosaurus")).rejects.toThrow(
      "no candidates",
    );
  });

  it("throws when candidates is undefined", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: undefined,
      },
    });

    await expect(generateDinoImage("Triceratops")).rejects.toThrow(
      "no candidates",
    );
  });

  it("throws when response has no image data (text only)", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [
          {
            content: {
              parts: [{ text: "I cannot generate images." }],
            },
          },
        ],
      },
    });

    await expect(generateDinoImage("Dilophosaurus")).rejects.toThrow(
      "did not contain image data",
    );
  });

  it("throws when the API call itself rejects", async () => {
    mockGenerateContent.mockRejectedValueOnce(
      new Error("API rate limit exceeded"),
    );

    await expect(generateDinoImage("Gallimimus")).rejects.toThrow(
      "API rate limit exceeded",
    );
  });

  it("passes the dinosaur name to the prompt", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: "aW1hZ2U=",
                    mimeType: "image/png",
                  },
                },
              ],
            },
          },
        ],
      },
    });

    await generateDinoImage("Parasaurolophus");

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const calledWith = mockGenerateContent.mock.calls[0][0] as string;
    expect(calledWith).toContain("Parasaurolophus");
  });
});
