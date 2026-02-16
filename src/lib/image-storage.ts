/**
 * Server-side persistence for generated dinosaur images.
 * Saves base64-encoded image data into the public directory
 * so Next.js can serve them as static files.
 */

import { createHash } from "crypto";
import { mkdir, writeFile, access } from "fs/promises";
import path from "path";

/** Directory under public/ where generated dino images are stored. */
const DINO_IMAGES_DIR = "dinos";

/**
 * Derive a filesystem-safe slug from a dinosaur name.
 * Lowercases, replaces non-alphanumeric characters with hyphens,
 * and collapses consecutive hyphens.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Map a MIME type to a file extension.
 */
export function mimeToExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
    case "image/jpg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

/**
 * Build a stable, unique filename for a generated image.
 * Uses the slugified dino name plus a short hash of the image data
 * to ensure uniqueness across multiple generations of the same dinosaur.
 */
export function buildImageFilename(
  dinoName: string,
  base64Data: string,
  mimeType: string,
): string {
  const slug = slugify(dinoName);
  const hash = createHash("sha256").update(base64Data).digest("hex").slice(0, 8);
  const ext = mimeToExtension(mimeType);
  return `${slug}-${hash}.${ext}`;
}

/**
 * Get the absolute path to the dino images directory under public/.
 */
export function getDinoImagesDir(): string {
  return path.join(process.cwd(), "public", DINO_IMAGES_DIR);
}

/**
 * Get the public URL path for a given image filename.
 * Next.js serves files from public/ at the root, so
 * public/dinos/foo.png → /dinos/foo.png
 */
export function getPublicImagePath(filename: string): string {
  return `/${DINO_IMAGES_DIR}/${filename}`;
}

/**
 * Save a generated dinosaur image to the filesystem.
 *
 * @param dinoName - The dinosaur name (used for the filename slug).
 * @param base64Data - The base64-encoded image data.
 * @param mimeType - The MIME type of the image (e.g. "image/png").
 * @returns The public URL path to the saved image (e.g. "/dinos/velociraptor-a1b2c3d4.png").
 */
export async function saveDinoImage(
  dinoName: string,
  base64Data: string,
  mimeType: string,
): Promise<string> {
  const filename = buildImageFilename(dinoName, base64Data, mimeType);
  const dir = getDinoImagesDir();
  const filePath = path.join(dir, filename);

  // Check if file already exists (same image data = same hash = idempotent)
  try {
    await access(filePath);
    // File already exists, return its public path
    return getPublicImagePath(filename);
  } catch {
    // File doesn't exist yet, proceed to write
  }

  // Ensure the directory exists
  await mkdir(dir, { recursive: true });

  // Decode base64 and write to disk
  const buffer = Buffer.from(base64Data, "base64");
  await writeFile(filePath, buffer);

  return getPublicImagePath(filename);
}
