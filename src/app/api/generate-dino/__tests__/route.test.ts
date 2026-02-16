import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the gemini module before importing the route
vi.mock("@/lib/gemini", () => ({
  generateDinoImage: vi.fn(),
}));

// Mock the image-storage module
vi.mock("@/lib/image-storage", () => ({
  saveDinoImage: vi.fn(),
}));

import { POST } from "../route";
import { generateDinoImage } from "@/lib/gemini";
import { saveDinoImage } from "@/lib/image-storage";
import { NextRequest } from "next/server";

const mockGenerateDinoImage = generateDinoImage as ReturnType<typeof vi.fn>;
const mockSaveDinoImage = saveDinoImage as ReturnType<typeof vi.fn>;

function makeRequest(body: unknown): NextRequest {
  return new NextRequest("http://localhost:3000/api/generate-dino", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeInvalidRequest(rawBody: string): NextRequest {
  return new NextRequest("http://localhost:3000/api/generate-dino", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody,
  });
}

describe("POST /api/generate-dino", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns generated image data and public path for a valid request", async () => {
    mockGenerateDinoImage.mockResolvedValueOnce({
      base64Data: "dGVzdC1kYXRh",
      mimeType: "image/png",
    });
    mockSaveDinoImage.mockResolvedValueOnce("/dinos/velociraptor-a1b2c3d4.png");

    const response = await POST(makeRequest({ dinoName: "Velociraptor" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.imagePath).toBe("/dinos/velociraptor-a1b2c3d4.png");
    expect(json.base64Data).toBe("dGVzdC1kYXRh");
    expect(json.mimeType).toBe("image/png");
    expect(mockGenerateDinoImage).toHaveBeenCalledWith("Velociraptor");
    expect(mockSaveDinoImage).toHaveBeenCalledWith(
      "Velociraptor",
      "dGVzdC1kYXRh",
      "image/png",
    );
  });

  it("trims whitespace from dinoName", async () => {
    mockGenerateDinoImage.mockResolvedValueOnce({
      base64Data: "abc",
      mimeType: "image/png",
    });
    mockSaveDinoImage.mockResolvedValueOnce("/dinos/t-rex-12345678.png");

    const response = await POST(makeRequest({ dinoName: "  T-Rex  " }));

    expect(response.status).toBe(200);
    expect(mockGenerateDinoImage).toHaveBeenCalledWith("T-Rex");
    expect(mockSaveDinoImage).toHaveBeenCalledWith("T-Rex", "abc", "image/png");
  });

  it("returns 400 for invalid JSON body", async () => {
    const response = await POST(makeInvalidRequest("not json{{{"));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("Invalid JSON");
  });

  it("returns 400 when dinoName is missing", async () => {
    const response = await POST(makeRequest({ name: "Raptor" }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("dinoName");
  });

  it("returns 400 when dinoName is not a string", async () => {
    const response = await POST(makeRequest({ dinoName: 123 }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("dinoName");
  });

  it("returns 400 when dinoName is empty string", async () => {
    const response = await POST(makeRequest({ dinoName: "" }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("non-empty");
  });

  it("returns 400 when dinoName is only whitespace", async () => {
    const response = await POST(makeRequest({ dinoName: "   " }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("non-empty");
  });

  it("returns 500 when image generation fails", async () => {
    mockGenerateDinoImage.mockRejectedValueOnce(
      new Error("API rate limit exceeded"),
    );

    const response = await POST(makeRequest({ dinoName: "Stegosaurus" }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("API rate limit exceeded");
  });

  it("returns 500 when image saving fails", async () => {
    mockGenerateDinoImage.mockResolvedValueOnce({
      base64Data: "abc",
      mimeType: "image/png",
    });
    mockSaveDinoImage.mockRejectedValueOnce(
      new Error("EACCES: permission denied"),
    );

    const response = await POST(makeRequest({ dinoName: "Stegosaurus" }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("EACCES: permission denied");
  });

  it("returns generic error message for non-Error throws", async () => {
    mockGenerateDinoImage.mockRejectedValueOnce("unexpected string error");

    const response = await POST(makeRequest({ dinoName: "Stegosaurus" }));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Image generation failed.");
  });
});
