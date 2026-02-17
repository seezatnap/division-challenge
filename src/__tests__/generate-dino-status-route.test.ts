/**
 * @jest-environment node
 */

/**
 * Tests for GET /api/generate-dino/status route handler.
 *
 * Uses Node test environment for Web API globals (Request, Response).
 */

import { GET } from "@/app/api/generate-dino/status/route";

describe("GET /api/generate-dino/status", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns configured: true when GEMINI_API_KEY is set", async () => {
    process.env.GEMINI_API_KEY = "test-key-123";

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.configured).toBe(true);
    expect(data.model).toBe("gemini-2.0-flash-exp");
    expect(data.error).toBeUndefined();
  });

  it("returns configured: false with 503 when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.configured).toBe(false);
    expect(data.model).toBe("gemini-2.0-flash-exp");
    expect(data.error).toContain("GEMINI_API_KEY");
  });

  it("returns configured: false when GEMINI_API_KEY is empty", async () => {
    process.env.GEMINI_API_KEY = "";

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(503);
    expect(data.configured).toBe(false);
  });
});
