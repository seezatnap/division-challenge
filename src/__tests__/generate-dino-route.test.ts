/**
 * @jest-environment node
 */

/**
 * Tests for the POST /api/generate-dino route handler.
 *
 * Uses Node test environment for Web API globals (Request, Response).
 * The dino-image-cache module is mocked to avoid real filesystem/API calls.
 */

import { POST } from "@/app/api/generate-dino/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock the cache-aware generation service
// ---------------------------------------------------------------------------

const mockGenerateDinoImageCached = jest.fn();

jest.mock("@/features/rewards/dino-image-cache", () => ({
  generateDinoImageCached: (...args: unknown[]) =>
    mockGenerateDinoImageCached(...args),
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

  it("returns 200 with imagePath and fromCache on successful generation", async () => {
    mockGenerateDinoImageCached.mockResolvedValue({
      success: true,
      imagePath: "dinos/t-rex.png",
      fromCache: false,
    });

    const response = await POST(makeRequest({ dinosaurName: "T-Rex" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.imagePath).toBe("dinos/t-rex.png");
    expect(data.fromCache).toBe(false);
  });

  it("returns fromCache: true when image was cached", async () => {
    mockGenerateDinoImageCached.mockResolvedValue({
      success: true,
      imagePath: "dinos/velociraptor.png",
      fromCache: true,
    });

    const response = await POST(
      makeRequest({ dinosaurName: "Velociraptor" }),
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.fromCache).toBe(true);
  });

  it("passes dinosaurName and sceneHint to the cache service", async () => {
    mockGenerateDinoImageCached.mockResolvedValue({
      success: true,
      imagePath: "dinos/velociraptor.png",
      fromCache: false,
    });

    await POST(
      makeRequest({
        dinosaurName: "Velociraptor",
        sceneHint: "in tall grass",
      }),
    );

    expect(mockGenerateDinoImageCached).toHaveBeenCalledWith({
      dinosaurName: "Velociraptor",
      sceneHint: "in tall grass",
    });
  });

  it("trims whitespace from dinosaurName", async () => {
    mockGenerateDinoImageCached.mockResolvedValue({
      success: true,
      imagePath: "dinos/triceratops.png",
      fromCache: false,
    });

    await POST(makeRequest({ dinosaurName: "  Triceratops  " }));

    expect(mockGenerateDinoImageCached).toHaveBeenCalledWith(
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
    mockGenerateDinoImageCached.mockResolvedValue({
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
});
