/**
 * Tests for the dinosaur image filesystem cache module.
 *
 * All filesystem operations use mocked `fs` functions.
 * Gemini generation is mocked to avoid real API calls.
 */

import {
  dinoSlug,
  getDinoImageDir,
  ensureDinoImageDir,
  findCachedImage,
  saveDinoImage,
  generateDinoImageCached,
} from "@/features/rewards/dino-image-cache";

// ---------------------------------------------------------------------------
// Mock fs
// ---------------------------------------------------------------------------

jest.mock("fs", () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

import { existsSync, readdirSync, mkdirSync, writeFileSync } from "fs";

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockReaddirSync = readdirSync as jest.MockedFunction<typeof readdirSync>;
const mockMkdirSync = mkdirSync as jest.MockedFunction<typeof mkdirSync>;
const mockWriteFileSync = writeFileSync as jest.MockedFunction<typeof writeFileSync>;

// ---------------------------------------------------------------------------
// Mock Gemini image service
// ---------------------------------------------------------------------------

const mockGenerateDinoImage = jest.fn();

jest.mock("@/features/rewards/gemini-image-service", () => ({
  generateDinoImage: (...args: unknown[]) => mockGenerateDinoImage(...args),
  imageToBuffer: (image: { base64Data: string }) =>
    Buffer.from(image.base64Data, "base64"),
  extensionForMimeType: (mime: string) => {
    const map: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
    };
    return map[mime] ?? "png";
  },
}));

// ---------------------------------------------------------------------------
// dinoSlug
// ---------------------------------------------------------------------------

describe("dinoSlug", () => {
  it("converts a simple name to kebab-case", () => {
    expect(dinoSlug("Tyrannosaurus Rex")).toBe("tyrannosaurus-rex");
  });

  it("handles multi-word lowercase names", () => {
    expect(dinoSlug("Moros intrepidus")).toBe("moros-intrepidus");
  });

  it("strips leading/trailing whitespace", () => {
    expect(dinoSlug("  Velociraptor  ")).toBe("velociraptor");
  });

  it("replaces multiple non-alphanumeric chars with a single dash", () => {
    expect(dinoSlug("Indominus   Rex")).toBe("indominus-rex");
  });

  it("removes leading/trailing dashes after slug conversion", () => {
    expect(dinoSlug("---Triceratops---")).toBe("triceratops");
  });

  it("handles single-word names", () => {
    expect(dinoSlug("Stegosaurus")).toBe("stegosaurus");
  });

  it("converts special characters to dashes", () => {
    expect(dinoSlug("Dino's Best!")).toBe("dino-s-best");
  });
});

// ---------------------------------------------------------------------------
// getDinoImageDir
// ---------------------------------------------------------------------------

describe("getDinoImageDir", () => {
  it("returns a path ending with public/dinos", () => {
    const dir = getDinoImageDir();
    expect(dir).toMatch(/public[/\\]dinos$/);
  });

  it("returns an absolute path", () => {
    const dir = getDinoImageDir();
    expect(dir).toMatch(/^[/\\]|^[A-Z]:\\/);
  });
});

// ---------------------------------------------------------------------------
// ensureDinoImageDir
// ---------------------------------------------------------------------------

describe("ensureDinoImageDir", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates the directory if it does not exist", () => {
    mockExistsSync.mockReturnValue(false);

    ensureDinoImageDir();

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringMatching(/public[/\\]dinos$/),
      { recursive: true },
    );
  });

  it("does not create the directory if it already exists", () => {
    mockExistsSync.mockReturnValue(true);

    ensureDinoImageDir();

    expect(mockMkdirSync).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// findCachedImage
// ---------------------------------------------------------------------------

describe("findCachedImage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns cached: false when directory does not exist", () => {
    mockExistsSync.mockReturnValue(false);

    const result = findCachedImage("Tyrannosaurus Rex");

    expect(result.cached).toBe(false);
  });

  it("returns cached: true with path when image file exists (png)", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(
      ["tyrannosaurus-rex.png"] as unknown as ReturnType<typeof readdirSync>,
    );

    const result = findCachedImage("Tyrannosaurus Rex");

    expect(result.cached).toBe(true);
    if (result.cached) {
      expect(result.imagePath).toBe("dinos/tyrannosaurus-rex.png");
      expect(result.absolutePath).toMatch(
        /public[/\\]dinos[/\\]tyrannosaurus-rex\.png$/,
      );
    }
  });

  it("returns cached: true when image exists as jpg", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(
      ["velociraptor.jpg"] as unknown as ReturnType<typeof readdirSync>,
    );

    const result = findCachedImage("Velociraptor");

    expect(result.cached).toBe(true);
    if (result.cached) {
      expect(result.imagePath).toBe("dinos/velociraptor.jpg");
    }
  });

  it("returns cached: true when image exists as webp", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(
      ["stegosaurus.webp"] as unknown as ReturnType<typeof readdirSync>,
    );

    const result = findCachedImage("Stegosaurus");

    expect(result.cached).toBe(true);
    if (result.cached) {
      expect(result.imagePath).toBe("dinos/stegosaurus.webp");
    }
  });

  it("returns cached: false when no matching file exists", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(
      ["other-dino.png"] as unknown as ReturnType<typeof readdirSync>,
    );

    const result = findCachedImage("Tyrannosaurus Rex");

    expect(result.cached).toBe(false);
  });

  it("prioritizes png over jpg when both exist", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(
      [
        "triceratops.png",
        "triceratops.jpg",
      ] as unknown as ReturnType<typeof readdirSync>,
    );

    const result = findCachedImage("Triceratops");

    expect(result.cached).toBe(true);
    if (result.cached) {
      expect(result.imagePath).toBe("dinos/triceratops.png");
    }
  });

  it("handles multi-word dinosaur names correctly", () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(
      ["moros-intrepidus.png"] as unknown as ReturnType<typeof readdirSync>,
    );

    const result = findCachedImage("Moros intrepidus");

    expect(result.cached).toBe(true);
    if (result.cached) {
      expect(result.imagePath).toBe("dinos/moros-intrepidus.png");
    }
  });
});

// ---------------------------------------------------------------------------
// saveDinoImage
// ---------------------------------------------------------------------------

describe("saveDinoImage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Simulate directory already exists
    mockExistsSync.mockReturnValue(true);
  });

  it("writes the image buffer to the correct path", () => {
    const image = { base64Data: "aGVsbG8=", mimeType: "image/png" };

    const result = saveDinoImage("Tyrannosaurus Rex", image);

    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    const [writePath, writeBuffer] = mockWriteFileSync.mock.calls[0];
    expect(writePath).toMatch(/tyrannosaurus-rex\.png$/);
    expect(Buffer.isBuffer(writeBuffer)).toBe(true);
    expect(result.imagePath).toBe("dinos/tyrannosaurus-rex.png");
  });

  it("uses correct extension for jpeg", () => {
    const image = { base64Data: "aGVsbG8=", mimeType: "image/jpeg" };

    const result = saveDinoImage("Velociraptor", image);

    expect(result.imagePath).toBe("dinos/velociraptor.jpg");
  });

  it("creates the directory if it does not exist", () => {
    mockExistsSync.mockReturnValue(false);

    const image = { base64Data: "aGVsbG8=", mimeType: "image/png" };
    saveDinoImage("Triceratops", image);

    expect(mockMkdirSync).toHaveBeenCalledWith(
      expect.stringMatching(/public[/\\]dinos$/),
      { recursive: true },
    );
  });

  it("returns absolute path alongside relative path", () => {
    const image = { base64Data: "aGVsbG8=", mimeType: "image/webp" };

    const result = saveDinoImage("Stegosaurus", image);

    expect(result.absolutePath).toMatch(
      /public[/\\]dinos[/\\]stegosaurus\.webp$/,
    );
    expect(result.imagePath).toBe("dinos/stegosaurus.webp");
  });
});

// ---------------------------------------------------------------------------
// generateDinoImageCached
// ---------------------------------------------------------------------------

describe("generateDinoImageCached", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns cached result without calling Gemini when image exists", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(
      ["spinosaurus.png"] as unknown as ReturnType<typeof readdirSync>,
    );

    const result = await generateDinoImageCached({
      dinosaurName: "Spinosaurus",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.imagePath).toBe("dinos/spinosaurus.png");
      expect(result.fromCache).toBe(true);
    }
    expect(mockGenerateDinoImage).not.toHaveBeenCalled();
  });

  it("calls Gemini and saves when image is not cached", async () => {
    // findCachedImage: directory exists but no matching file
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(
      [] as unknown as ReturnType<typeof readdirSync>,
    );

    mockGenerateDinoImage.mockResolvedValue({
      success: true,
      image: { base64Data: "aGVsbG8=", mimeType: "image/png" },
    });

    const result = await generateDinoImageCached({
      dinosaurName: "Brachiosaurus",
    });

    expect(mockGenerateDinoImage).toHaveBeenCalledWith({
      dinosaurName: "Brachiosaurus",
    });
    expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.imagePath).toBe("dinos/brachiosaurus.png");
      expect(result.fromCache).toBe(false);
    }
  });

  it("passes sceneHint to Gemini when provided", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(
      [] as unknown as ReturnType<typeof readdirSync>,
    );

    mockGenerateDinoImage.mockResolvedValue({
      success: true,
      image: { base64Data: "aGVsbG8=", mimeType: "image/png" },
    });

    await generateDinoImageCached({
      dinosaurName: "Dilophosaurus",
      sceneHint: "near a waterfall",
    });

    expect(mockGenerateDinoImage).toHaveBeenCalledWith({
      dinosaurName: "Dilophosaurus",
      sceneHint: "near a waterfall",
    });
  });

  it("returns error when Gemini generation fails", async () => {
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync.mockReturnValue(
      [] as unknown as ReturnType<typeof readdirSync>,
    );

    mockGenerateDinoImage.mockResolvedValue({
      success: false,
      error: "API rate limit exceeded",
    });

    const result = await generateDinoImageCached({
      dinosaurName: "Gallimimus",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("API rate limit exceeded");
    }
    expect(mockWriteFileSync).not.toHaveBeenCalled();
  });

  it("does not call Gemini on second call for same dinosaur (cache hit)", async () => {
    // First call: not cached, generates
    mockExistsSync.mockReturnValue(true);
    mockReaddirSync
      .mockReturnValueOnce([] as unknown as ReturnType<typeof readdirSync>)
      .mockReturnValueOnce(
        ["parasaurolophus.png"] as unknown as ReturnType<typeof readdirSync>,
      );

    mockGenerateDinoImage.mockResolvedValue({
      success: true,
      image: { base64Data: "aGVsbG8=", mimeType: "image/png" },
    });

    const result1 = await generateDinoImageCached({
      dinosaurName: "Parasaurolophus",
    });

    expect(result1.success).toBe(true);
    if (result1.success) {
      expect(result1.fromCache).toBe(false);
    }
    expect(mockGenerateDinoImage).toHaveBeenCalledTimes(1);

    // Second call: now cached
    const result2 = await generateDinoImageCached({
      dinosaurName: "Parasaurolophus",
    });

    expect(result2.success).toBe(true);
    if (result2.success) {
      expect(result2.fromCache).toBe(true);
    }
    // Gemini should NOT be called again
    expect(mockGenerateDinoImage).toHaveBeenCalledTimes(1);
  });
});
