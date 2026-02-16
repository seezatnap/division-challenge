import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import path from "path";
import {
  slugify,
  mimeToExtension,
  buildImageFilename,
  getDinoImagesDir,
  getPublicImagePath,
  saveDinoImage,
} from "../image-storage";

// Mock fs/promises
vi.mock("fs/promises", () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  access: vi.fn().mockRejectedValue(new Error("ENOENT")),
}));

import { mkdir, writeFile, access } from "fs/promises";

const mockMkdir = mkdir as ReturnType<typeof vi.fn>;
const mockWriteFile = writeFile as ReturnType<typeof vi.fn>;
const mockAccess = access as ReturnType<typeof vi.fn>;

describe("slugify", () => {
  it("lowercases the name", () => {
    expect(slugify("Velociraptor")).toBe("velociraptor");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("Tyrannosaurus Rex")).toBe("tyrannosaurus-rex");
  });

  it("replaces non-alphanumeric characters with hyphens", () => {
    expect(slugify("Moros intrepidus")).toBe("moros-intrepidus");
  });

  it("collapses consecutive hyphens", () => {
    expect(slugify("Indominus   Rex")).toBe("indominus-rex");
  });

  it("strips leading and trailing hyphens", () => {
    expect(slugify(" Raptor ")).toBe("raptor");
  });

  it("handles names with special characters", () => {
    expect(slugify("T-Rex (large)")).toBe("t-rex-large");
  });
});

describe("mimeToExtension", () => {
  it("returns png for image/png", () => {
    expect(mimeToExtension("image/png")).toBe("png");
  });

  it("returns jpg for image/jpeg", () => {
    expect(mimeToExtension("image/jpeg")).toBe("jpg");
  });

  it("returns jpg for image/jpg", () => {
    expect(mimeToExtension("image/jpg")).toBe("jpg");
  });

  it("returns webp for image/webp", () => {
    expect(mimeToExtension("image/webp")).toBe("webp");
  });

  it("defaults to png for unknown types", () => {
    expect(mimeToExtension("image/bmp")).toBe("png");
    expect(mimeToExtension("application/octet-stream")).toBe("png");
  });
});

describe("buildImageFilename", () => {
  it("includes slugified dino name", () => {
    const filename = buildImageFilename("Velociraptor", "dGVzdA==", "image/png");
    expect(filename).toMatch(/^velociraptor-/);
  });

  it("includes content hash for uniqueness", () => {
    const data = "dGVzdC1kYXRh";
    const expectedHash = createHash("sha256").update(data).digest("hex").slice(0, 8);
    const filename = buildImageFilename("T-Rex", data, "image/png");
    expect(filename).toContain(expectedHash);
  });

  it("uses correct extension from mime type", () => {
    expect(buildImageFilename("Raptor", "abc", "image/png")).toMatch(/\.png$/);
    expect(buildImageFilename("Raptor", "abc", "image/jpeg")).toMatch(/\.jpg$/);
    expect(buildImageFilename("Raptor", "abc", "image/webp")).toMatch(/\.webp$/);
  });

  it("produces different filenames for different image data", () => {
    const f1 = buildImageFilename("Raptor", "data1", "image/png");
    const f2 = buildImageFilename("Raptor", "data2", "image/png");
    expect(f1).not.toBe(f2);
  });

  it("produces same filename for same inputs (stable)", () => {
    const f1 = buildImageFilename("Raptor", "same-data", "image/png");
    const f2 = buildImageFilename("Raptor", "same-data", "image/png");
    expect(f1).toBe(f2);
  });
});

describe("getDinoImagesDir", () => {
  it("returns path under public/dinos", () => {
    const dir = getDinoImagesDir();
    expect(dir).toBe(path.join(process.cwd(), "public", "dinos"));
  });
});

describe("getPublicImagePath", () => {
  it("returns URL path starting with /dinos/", () => {
    expect(getPublicImagePath("velociraptor-abc123.png")).toBe(
      "/dinos/velociraptor-abc123.png",
    );
  });
});

describe("saveDinoImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: file does not exist
    mockAccess.mockRejectedValue(new Error("ENOENT"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates directory and writes file", async () => {
    const imagePath = await saveDinoImage("Velociraptor", "dGVzdA==", "image/png");

    expect(mockMkdir).toHaveBeenCalledWith(
      expect.stringContaining(path.join("public", "dinos")),
      { recursive: true },
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining("velociraptor-"),
      expect.any(Buffer),
    );
    expect(imagePath).toMatch(/^\/dinos\/velociraptor-[a-f0-9]{8}\.png$/);
  });

  it("returns correct public path for the image", async () => {
    const imagePath = await saveDinoImage("T-Rex", "aW1hZ2U=", "image/png");
    expect(imagePath).toMatch(/^\/dinos\/t-rex-[a-f0-9]{8}\.png$/);
  });

  it("decodes base64 data correctly when writing", async () => {
    const base64 = "SGVsbG8gV29ybGQ="; // "Hello World"
    await saveDinoImage("Raptor", base64, "image/png");

    const writtenBuffer = mockWriteFile.mock.calls[0][1] as Buffer;
    expect(writtenBuffer.toString("utf-8")).toBe("Hello World");
  });

  it("skips write if file already exists (idempotent)", async () => {
    mockAccess.mockResolvedValueOnce(undefined);

    const imagePath = await saveDinoImage("Raptor", "dGVzdA==", "image/png");

    expect(mockMkdir).not.toHaveBeenCalled();
    expect(mockWriteFile).not.toHaveBeenCalled();
    expect(imagePath).toMatch(/^\/dinos\/raptor-/);
  });

  it("handles different MIME types correctly", async () => {
    const jpegPath = await saveDinoImage("Dino", "abc", "image/jpeg");
    expect(jpegPath).toMatch(/\.jpg$/);

    vi.clearAllMocks();
    mockAccess.mockRejectedValue(new Error("ENOENT"));

    const webpPath = await saveDinoImage("Dino", "xyz", "image/webp");
    expect(webpPath).toMatch(/\.webp$/);
  });

  it("produces stable paths for the same input", async () => {
    const path1 = await saveDinoImage("Stego", "data123", "image/png");

    vi.clearAllMocks();
    mockAccess.mockRejectedValue(new Error("ENOENT"));

    const path2 = await saveDinoImage("Stego", "data123", "image/png");
    expect(path1).toBe(path2);
  });

  it("propagates filesystem errors", async () => {
    mockMkdir.mockRejectedValueOnce(new Error("EACCES: permission denied"));

    await expect(
      saveDinoImage("Raptor", "dGVzdA==", "image/png"),
    ).rejects.toThrow("EACCES");
  });
});
