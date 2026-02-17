/**
 * @jest-environment node
 */

/**
 * Tests for the GET /api/generate-dino/check route handler.
 *
 * The dino-image-cache module is mocked to avoid real filesystem access.
 */

import { GET } from "@/app/api/generate-dino/check/route";
import { NextRequest } from "next/server";

// ---------------------------------------------------------------------------
// Mock the cache module
// ---------------------------------------------------------------------------

const mockFindCachedImage = jest.fn();

jest.mock("@/features/rewards/dino-image-cache", () => ({
  findCachedImage: (...args: unknown[]) => mockFindCachedImage(...args),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(name?: string): NextRequest {
  const url = new URL("http://localhost:3000/api/generate-dino/check");
  if (name !== undefined) {
    url.searchParams.set("name", name);
  }
  return new NextRequest(url);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/generate-dino/check", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns exists: true when image is cached", async () => {
    mockFindCachedImage.mockReturnValue({
      cached: true,
      imagePath: "dinos/tyrannosaurus-rex.png",
      absolutePath: "/project/public/dinos/tyrannosaurus-rex.png",
    });

    const response = await GET(makeRequest("Tyrannosaurus Rex"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exists).toBe(true);
    expect(data.imagePath).toBe("dinos/tyrannosaurus-rex.png");
  });

  it("returns exists: false when image is not cached", async () => {
    mockFindCachedImage.mockReturnValue({ cached: false });

    const response = await GET(makeRequest("Velociraptor"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.exists).toBe(false);
    expect(data.imagePath).toBeUndefined();
  });

  it("returns 400 when name parameter is missing", async () => {
    const response = await GET(makeRequest());
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.exists).toBe(false);
    expect(data.error).toContain("name");
  });

  it("returns 400 when name parameter is empty", async () => {
    const response = await GET(makeRequest(""));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.exists).toBe(false);
  });

  it("returns 400 when name parameter is whitespace only", async () => {
    const response = await GET(makeRequest("   "));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.exists).toBe(false);
  });

  it("trims whitespace from name parameter", async () => {
    mockFindCachedImage.mockReturnValue({ cached: false });

    await GET(makeRequest("  Triceratops  "));

    expect(mockFindCachedImage).toHaveBeenCalledWith("Triceratops");
  });

  it("passes the name to findCachedImage", async () => {
    mockFindCachedImage.mockReturnValue({ cached: false });

    await GET(makeRequest("Spinosaurus"));

    expect(mockFindCachedImage).toHaveBeenCalledWith("Spinosaurus");
  });
});
