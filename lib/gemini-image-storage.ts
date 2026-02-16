import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const GENERATED_DINOSAUR_PUBLIC_SUBDIRECTORY = "generated-dinosaurs";

const MIME_EXTENSION_MAP: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export interface PersistGeminiGeneratedImageOptions {
  dinosaurName: string;
  mimeType: string;
  data: string;
  projectRootDir?: string;
  publicSubdirectory?: string;
}

export interface PersistedGeminiGeneratedImage {
  imagePath: string;
  fileName: string;
}

function normalizeDinosaurName(dinosaurName: string): string {
  const normalized = dinosaurName.trim();

  if (!normalized) {
    throw new Error("Dinosaur name is required for image persistence.");
  }

  return normalized;
}

function normalizePublicSubdirectory(subdirectory: string): string {
  const trimmed = subdirectory.trim().replace(/^\/+|\/+$/g, "");

  if (!trimmed) {
    throw new Error("Public subdirectory must be a non-empty path.");
  }

  const segments = trimmed.split(/[\\/]+/).filter(Boolean);

  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("Public subdirectory must not contain path traversal.");
  }

  return segments.join("/");
}

function toSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug.length > 0 ? slug : "dinosaur";
}

function extensionFromMimeType(mimeType: string): string {
  const normalizedMimeType = mimeType.trim().toLowerCase();

  if (normalizedMimeType in MIME_EXTENSION_MAP) {
    return MIME_EXTENSION_MAP[normalizedMimeType];
  }

  if (!normalizedMimeType.startsWith("image/")) {
    throw new Error(`Unsupported image MIME type: ${mimeType}`);
  }

  const subtype = normalizedMimeType.slice("image/".length);
  const baseSubtype = subtype.split(";")[0].split("+")[0];
  const normalizedSubtype = baseSubtype.replace(/[^a-z0-9-]/g, "");

  if (!normalizedSubtype) {
    throw new Error(`Unsupported image MIME type: ${mimeType}`);
  }

  return normalizedSubtype;
}

function buildStableHash(
  dinosaurName: string,
  mimeType: string,
  data: string,
): string {
  return createHash("sha256")
    .update(dinosaurName)
    .update("\n")
    .update(mimeType)
    .update("\n")
    .update(data.trim())
    .digest("hex")
    .slice(0, 16);
}

function decodeBase64Data(base64Data: string): Buffer {
  if (!BASE64_PATTERN.test(base64Data)) {
    throw new Error("Generated image data must be valid base64 content.");
  }

  if (base64Data.length % 4 === 1) {
    throw new Error("Generated image data must be valid base64 content.");
  }

  if (base64Data.includes("=") && base64Data.length % 4 !== 0) {
    throw new Error("Generated image data must be valid base64 content.");
  }

  const fileBuffer = Buffer.from(base64Data, "base64");

  if (fileBuffer.length === 0) {
    throw new Error("Generated image data could not be decoded from base64.");
  }

  const canonicalBase64 = fileBuffer.toString("base64");
  const normalizedInput = base64Data.includes("=")
    ? base64Data
    : base64Data + "=".repeat((4 - (base64Data.length % 4)) % 4);

  if (canonicalBase64 !== normalizedInput) {
    throw new Error("Generated image data must be valid base64 content.");
  }

  return fileBuffer;
}

export function buildGeneratedDinosaurFileName(
  options: Pick<PersistGeminiGeneratedImageOptions, "dinosaurName" | "mimeType" | "data">,
): string {
  const dinosaurName = normalizeDinosaurName(options.dinosaurName);
  const extension = extensionFromMimeType(options.mimeType);
  const hash = buildStableHash(dinosaurName, options.mimeType, options.data);

  return `${toSlug(dinosaurName)}-${hash}.${extension}`;
}

export async function persistGeminiGeneratedImage(
  options: PersistGeminiGeneratedImageOptions,
): Promise<PersistedGeminiGeneratedImage> {
  const subdirectory = normalizePublicSubdirectory(
    options.publicSubdirectory ?? GENERATED_DINOSAUR_PUBLIC_SUBDIRECTORY,
  );
  const base64Data = options.data.trim();

  if (!base64Data) {
    throw new Error("Generated image data must be non-empty base64 content.");
  }

  const fileBuffer = decodeBase64Data(base64Data);
  const fileName = buildGeneratedDinosaurFileName({
    ...options,
    data: base64Data,
  });

  const publicDirectoryPath = path.join(
    options.projectRootDir ?? process.cwd(),
    "public",
    ...subdirectory.split("/"),
  );
  const imageFilePath = path.join(publicDirectoryPath, fileName);

  await mkdir(publicDirectoryPath, { recursive: true });
  await writeFile(imageFilePath, fileBuffer);

  return {
    imagePath: `/${path.posix.join(subdirectory, fileName)}`,
    fileName,
  };
}
