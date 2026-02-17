/**
 * @jest-environment node
 */

/**
 * Tests for the POST /api/generate-dino route handler.
 *
 * Uses Node test environment for Web API globals (Request, Response).
 * The Gemini image service is mocked to avoid real API calls.
 */

import { POST } from "@/app/api/generate-dino/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock the image generation service
// ---------------------------------------------------------------------------

const mockGenerateDinoImage = jest.fn();

jest.mock("@/features/rewards/gemini-image-service", () => ({
  generateDinoImage: (...args: unknown[]) => mockGenerateDinoImage(...args),
  extensionForMimeType: (mime: string) => {
    const map: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
    };
    return map[mime] ?? "png";
  },
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/generate-dino", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeInvalidRequest(): NextRequest {
  return new NextRequest("http://localhost:3000/api/generate-dino", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "not valid json{{{",
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("POST /api/generate-dino", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with image data on successful generation", async () => {
    mockGenerateDinoImage.mockResolvedValue({
      success: true,
      image: {
        base64Data: "abc123",
        mimeType: "image/png",
      },
    });

    const response = await POST(makeRequest({ dinosaurName: "T-Rex" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.image.base64Data).toBe("abc123");
    expect(data.image.mimeType).toBe("image/png");
    expect(data.image.extension).toBe("png");
  });

  it("passes dinosaurName and sceneHint to the service", async () => {
    mockGenerateDinoImage.mockResolvedValue({
      success: true,
      image: { base64Data: "d", mimeType: "image/png" },
    });

    await POST(
      makeRequest({
        dinosaurName: "Velociraptor",
        sceneHint: "in tall grass",
      }),
    );

    expect(mockGenerateDinoImage).toHaveBeenCalledWith({
      dinosaurName: "Velociraptor",
      sceneHint: "in tall grass",
    });
  });

  it("trims whitespace from dinosaurName", async () => {
    mockGenerateDinoImage.mockResolvedValue({
      success: true,
      image: { base64Data: "d", mimeType: "image/png" },
    });

    await POST(makeRequest({ dinosaurName: "  Triceratops  " }));

    expect(mockGenerateDinoImage).toHaveBeenCalledWith(
      expect.objectContaining({ dinosaurName: "Triceratops" }),
    );
  });

  it("returns 400 when dinosaurName is missing", async () => {
    const response = await POST(makeRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("dinosaurName");
  });

  it("returns 400 when dinosaurName is empty string", async () => {
    const response = await POST(makeRequest({ dinosaurName: "" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("dinosaurName");
  });

  it("returns 400 when dinosaurName is whitespace only", async () => {
    const response = await POST(makeRequest({ dinosaurName: "   " }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it("returns 400 for invalid JSON body", async () => {
    const response = await POST(makeInvalidRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain("Invalid JSON");
  });

  it("returns 502 when generation fails", async () => {
    mockGenerateDinoImage.mockResolvedValue({
      success: false,
      error: "API rate limit exceeded",
    });

    const response = await POST(
      makeRequest({ dinosaurName: "Spinosaurus" }),
    );
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.success).toBe(false);
    expect(data.error).toContain("API rate limit exceeded");
  });

  it("includes extension in successful response", async () => {
    mockGenerateDinoImage.mockResolvedValue({
      success: true,
      image: { base64Data: "d", mimeType: "image/jpeg" },
    });

    const response = await POST(
      makeRequest({ dinosaurName: "Stegosaurus" }),
    );
    const data = await response.json();

    expect(data.image.extension).toBe("jpg");
  });
});
