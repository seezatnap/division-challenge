/**
 * Tests for the Gemini image generation service.
 *
 * All calls to GoogleGenerativeAI are mocked — no real API calls are made.
 */

import {
  parseImageFromResponse,
  generateDinoImage,
  imageToBuffer,
  extensionForMimeType,
  GeminiResponseParseError,
  GeminiApiError,
} from "@/features/rewards/gemini-image-service";

// ---------------------------------------------------------------------------
// Mock the @google/generative-ai SDK
// ---------------------------------------------------------------------------

const mockGenerateContent = jest.fn();
const mockGetGenerativeModel = jest.fn(() => ({
  generateContent: mockGenerateContent,
}));

jest.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: jest.fn(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
}));

// ---------------------------------------------------------------------------
// parseImageFromResponse
// ---------------------------------------------------------------------------

describe("parseImageFromResponse", () => {
  it("extracts inline image data from a valid response", () => {
    const response = {
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: "aGVsbG8=",
                    mimeType: "image/png",
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const image = parseImageFromResponse(response);

    expect(image).toEqual({
      base64Data: "aGVsbG8=",
      mimeType: "image/png",
    });
  });

  it("extracts image from response with mixed text and image parts", () => {
    const response = {
      response: {
        candidates: [
          {
            content: {
              parts: [
                { text: "Here is your image:" },
                {
                  inlineData: {
                    data: "iVBORw0K",
                    mimeType: "image/jpeg",
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const image = parseImageFromResponse(response);

    expect(image).toEqual({
      base64Data: "iVBORw0K",
      mimeType: "image/jpeg",
    });
  });

  it("throws GeminiResponseParseError when candidates array is empty", () => {
    const response = {
      response: {
        candidates: [],
      },
    };

    expect(() => parseImageFromResponse(response)).toThrow(
      GeminiResponseParseError,
    );
    expect(() => parseImageFromResponse(response)).toThrow(
      "no candidates",
    );
  });

  it("throws GeminiResponseParseError when candidates is undefined", () => {
    const response = {
      response: {},
    };

    expect(() => parseImageFromResponse(response as never)).toThrow(
      GeminiResponseParseError,
    );
  });

  it("throws GeminiResponseParseError when parts array is empty", () => {
    const response = {
      response: {
        candidates: [
          {
            content: {
              parts: [],
            },
          },
        ],
      },
    };

    expect(() => parseImageFromResponse(response)).toThrow(
      GeminiResponseParseError,
    );
    expect(() => parseImageFromResponse(response)).toThrow("no parts");
  });

  it("throws GeminiResponseParseError when parts have no inline data", () => {
    const response = {
      response: {
        candidates: [
          {
            content: {
              parts: [{ text: "Just text, no image" }],
            },
          },
        ],
      },
    };

    expect(() => parseImageFromResponse(response)).toThrow(
      GeminiResponseParseError,
    );
    expect(() => parseImageFromResponse(response)).toThrow("no inline image");
  });

  it("throws GeminiResponseParseError when inlineData has empty data string", () => {
    const response = {
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: "",
                    mimeType: "image/png",
                  },
                },
              ],
            },
          },
        ],
      },
    };

    expect(() => parseImageFromResponse(response)).toThrow(
      GeminiResponseParseError,
    );
  });

  it("skips parts with non-string data and finds the valid one", () => {
    const response = {
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: 12345, // wrong type
                    mimeType: "image/png",
                  },
                },
                {
                  inlineData: {
                    data: "validBase64",
                    mimeType: "image/webp",
                  },
                },
              ],
            },
          },
        ],
      },
    };

    const image = parseImageFromResponse(response);

    expect(image).toEqual({
      base64Data: "validBase64",
      mimeType: "image/webp",
    });
  });
});

// ---------------------------------------------------------------------------
// generateDinoImage
// ---------------------------------------------------------------------------

describe("generateDinoImage", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, GEMINI_API_KEY: "test-key" };
    jest.clearAllMocks();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns success with image data on successful generation", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: "base64ImageData",
                    mimeType: "image/png",
                  },
                },
              ],
            },
          },
        ],
      },
    });

    const result = await generateDinoImage({
      dinosaurName: "Tyrannosaurus Rex",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.image.base64Data).toBe("base64ImageData");
      expect(result.image.mimeType).toBe("image/png");
    }
  });

  it("passes the dinosaur name to the prompt builder", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: {
                    data: "data",
                    mimeType: "image/png",
                  },
                },
              ],
            },
          },
        ],
      },
    });

    await generateDinoImage({ dinosaurName: "Velociraptor" });

    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    const promptArg = mockGenerateContent.mock.calls[0][0];
    expect(promptArg).toContain("Velociraptor");
  });

  it("creates the model with gemini-2.0-flash-exp", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: { data: "d", mimeType: "image/png" },
                },
              ],
            },
          },
        ],
      },
    });

    await generateDinoImage({ dinosaurName: "Triceratops" });

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "gemini-2.0-flash-exp",
      }),
    );
  });

  it("configures responseModalities for image output", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: { data: "d", mimeType: "image/png" },
                },
              ],
            },
          },
        ],
      },
    });

    await generateDinoImage({ dinosaurName: "Triceratops" });

    expect(mockGetGenerativeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        generationConfig: expect.objectContaining({
          responseModalities: ["TEXT", "IMAGE"],
        }),
      }),
    );
  });

  it("returns error when API key is missing", async () => {
    delete process.env.GEMINI_API_KEY;

    const result = await generateDinoImage({
      dinosaurName: "Stegosaurus",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("GEMINI_API_KEY");
    }
  });

  it("returns error when generateContent throws", async () => {
    mockGenerateContent.mockRejectedValue(
      new Error("API rate limit exceeded"),
    );

    const result = await generateDinoImage({
      dinosaurName: "Spinosaurus",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("API rate limit exceeded");
    }
  });

  it("returns error when response has no image data", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [
          {
            content: {
              parts: [{ text: "Sorry, I cannot generate images" }],
            },
          },
        ],
      },
    });

    const result = await generateDinoImage({
      dinosaurName: "Brachiosaurus",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("no inline image");
    }
  });

  it("returns error for non-Error thrown values", async () => {
    mockGenerateContent.mockRejectedValue("string-error");

    const result = await generateDinoImage({
      dinosaurName: "Dilophosaurus",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("Unknown error");
    }
  });

  it("handles sceneHint option", async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        candidates: [
          {
            content: {
              parts: [
                {
                  inlineData: { data: "d", mimeType: "image/png" },
                },
              ],
            },
          },
        ],
      },
    });

    await generateDinoImage({
      dinosaurName: "Parasaurolophus",
      sceneHint: "near a waterfall",
    });

    const promptArg = mockGenerateContent.mock.calls[0][0];
    expect(promptArg).toContain("Parasaurolophus");
    expect(promptArg).toContain("near a waterfall");
  });
});

// ---------------------------------------------------------------------------
// imageToBuffer
// ---------------------------------------------------------------------------

describe("imageToBuffer", () => {
  it("converts base64 data to a Buffer", () => {
    const image = {
      base64Data: Buffer.from("hello world").toString("base64"),
      mimeType: "image/png",
    };

    const buffer = imageToBuffer(image);

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.toString("utf-8")).toBe("hello world");
  });

  it("returns an empty Buffer for empty base64 data", () => {
    const image = { base64Data: "", mimeType: "image/png" };

    const buffer = imageToBuffer(image);

    expect(buffer.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// extensionForMimeType
// ---------------------------------------------------------------------------

describe("extensionForMimeType", () => {
  it.each([
    ["image/png", "png"],
    ["image/jpeg", "jpg"],
    ["image/webp", "webp"],
    ["image/gif", "gif"],
  ])("maps %s → %s", (mimeType, expected) => {
    expect(extensionForMimeType(mimeType)).toBe(expected);
  });

  it("defaults to png for unknown mime types", () => {
    expect(extensionForMimeType("image/bmp")).toBe("png");
    expect(extensionForMimeType("application/octet-stream")).toBe("png");
  });
});

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

describe("GeminiResponseParseError", () => {
  it("has the correct name", () => {
    const err = new GeminiResponseParseError("test");
    expect(err.name).toBe("GeminiResponseParseError");
    expect(err.message).toBe("test");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("GeminiApiError", () => {
  it("has the correct name and preserves cause", () => {
    const cause = new Error("network failure");
    const err = new GeminiApiError("API call failed", cause);

    expect(err.name).toBe("GeminiApiError");
    expect(err.message).toBe("API call failed");
    expect(err.cause).toBe(cause);
    expect(err).toBeInstanceOf(Error);
  });
});
