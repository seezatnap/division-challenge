/**
 * Filesystem Image Cache for Dinosaur Art
 *
 * Provides caching / existence checks so dinosaur image generation
 * is skipped when the asset already exists on disk.
 *
 * Images are stored under `public/dinos/` with slugified filenames
 * (e.g. "tyrannosaurus-rex.png"). The module exposes:
 *
 * - `dinoSlug(name)` – deterministic kebab-case slug for a dinosaur name
 * - `getDinoImageDir()` – absolute path to the image directory
 * - `findCachedImage(dinoName)` – checks disk for an existing image
 * - `saveDinoImage(dinoName, image)` – writes a generated image to disk
 * - `generateDinoImageCached(options)` – cache-aware wrapper around Gemini generation
 */

import { existsSync, readdirSync, mkdirSync, writeFileSync } from "fs";
import path from "path";
import {
  generateDinoImage,
  imageToBuffer,
  extensionForMimeType,
} from "./gemini-image-service";
import type { GeneratedImage, ImageGenerationOutcome } from "./gemini-image-service";
import type { DinoPromptOptions } from "./prompt-builder";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Subdirectory under `public/` where dino images are stored. */
const DINO_IMAGE_SUBDIR = "dinos";

/** Supported image extensions that we scan for when checking the cache. */
const SUPPORTED_EXTENSIONS = ["png", "jpg", "webp", "gif"] as const;

// ---------------------------------------------------------------------------
// Slug utility
// ---------------------------------------------------------------------------

/**
 * Converts a dinosaur name to a filesystem-safe kebab-case slug.
 *
 * Examples:
 *   "Tyrannosaurus Rex" → "tyrannosaurus-rex"
 *   "Moros intrepidus"  → "moros-intrepidus"
 *   "Indominus Rex"     → "indominus-rex"
 *
 * @param name - The dinosaur display name.
 * @returns A lowercase kebab-case slug.
 */
export function dinoSlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------
// Directory helpers
// ---------------------------------------------------------------------------

/**
 * Returns the absolute path to the dino image directory (`<project>/public/dinos`).
 *
 * Uses `process.cwd()` which in Next.js always resolves to the project root.
 */
export function getDinoImageDir(): string {
  return path.join(process.cwd(), "public", DINO_IMAGE_SUBDIR);
}

/**
 * Ensures the dino image directory exists, creating it recursively if needed.
 */
export function ensureDinoImageDir(): void {
  const dir = getDinoImageDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

// ---------------------------------------------------------------------------
// Cache result types
// ---------------------------------------------------------------------------

/** Result when a cached image is found on disk. */
export interface CachedImageHit {
  cached: true;
  /** Path relative to `public/` (suitable for `<img src="`). */
  imagePath: string;
  /** Absolute path to the file on disk. */
  absolutePath: string;
}

/** Result when no cached image exists. */
export interface CachedImageMiss {
  cached: false;
}

export type CacheCheckResult = CachedImageHit | CachedImageMiss;

// ---------------------------------------------------------------------------
// Cache lookup
// ---------------------------------------------------------------------------

/**
 * Checks whether a dinosaur image already exists on disk.
 *
 * Scans for `<slug>.<ext>` across all supported extensions so the check
 * is format-agnostic (Gemini may return PNG, JPEG, or WebP).
 *
 * @param dinoName - The dinosaur display name.
 * @returns A discriminated union indicating hit or miss.
 */
export function findCachedImage(dinoName: string): CacheCheckResult {
  const slug = dinoSlug(dinoName);
  const dir = getDinoImageDir();

  if (!existsSync(dir)) {
    return { cached: false };
  }

  // Scan directory for any file matching the slug
  const files = readdirSync(dir);

  for (const ext of SUPPORTED_EXTENSIONS) {
    const filename = `${slug}.${ext}`;
    if (files.includes(filename)) {
      return {
        cached: true,
        imagePath: `${DINO_IMAGE_SUBDIR}/${filename}`,
        absolutePath: path.join(dir, filename),
      };
    }
  }

  return { cached: false };
}

// ---------------------------------------------------------------------------
// Save to cache
// ---------------------------------------------------------------------------

/** Info about a successfully saved image. */
export interface SavedImageInfo {
  /** Path relative to `public/` (e.g. "dinos/tyrannosaurus-rex.png"). */
  imagePath: string;
  /** Absolute path on disk. */
  absolutePath: string;
}

/**
 * Writes a generated image to the filesystem cache.
 *
 * Creates the directory if it does not exist and writes the image
 * as `<slug>.<extension>` derived from the MIME type.
 *
 * @param dinoName - The dinosaur display name.
 * @param image - The generated image data (base64 + mime type).
 * @returns Metadata about the saved file.
 */
export function saveDinoImage(
  dinoName: string,
  image: GeneratedImage,
): SavedImageInfo {
  ensureDinoImageDir();

  const slug = dinoSlug(dinoName);
  const ext = extensionForMimeType(image.mimeType);
  const filename = `${slug}.${ext}`;
  const dir = getDinoImageDir();
  const absolutePath = path.join(dir, filename);

  writeFileSync(absolutePath, imageToBuffer(image));

  return {
    imagePath: `${DINO_IMAGE_SUBDIR}/${filename}`,
    absolutePath,
  };
}

// ---------------------------------------------------------------------------
// Cache-aware generation
// ---------------------------------------------------------------------------

/** Successful outcome from cache-aware generation. */
export interface CachedGenerationResult {
  success: true;
  /** Path relative to `public/` for serving the image. */
  imagePath: string;
  /** Whether the result came from the cache (true) or was freshly generated (false). */
  fromCache: boolean;
}

/** Failed outcome from cache-aware generation. */
export interface CachedGenerationError {
  success: false;
  error: string;
}

export type CachedGenerationOutcome =
  | CachedGenerationResult
  | CachedGenerationError;

/**
 * Cache-aware dinosaur image generation.
 *
 * 1. Checks if the image already exists on disk.
 * 2. If cached → returns immediately with the existing path (no API call).
 * 3. If not cached → calls Gemini to generate, saves to disk, then returns.
 *
 * This is the main entry point for tasks #17, #19 (prefetch), and #18 (rewards).
 *
 * @param options - Dinosaur name and optional scene hint.
 * @returns Outcome with image path or error.
 */
export async function generateDinoImageCached(
  options: DinoPromptOptions,
): Promise<CachedGenerationOutcome> {
  // Step 1: Check cache
  const cacheResult = findCachedImage(options.dinosaurName);

  if (cacheResult.cached) {
    return {
      success: true,
      imagePath: cacheResult.imagePath,
      fromCache: true,
    };
  }

  // Step 2: Generate via Gemini
  const outcome: ImageGenerationOutcome = await generateDinoImage(options);

  if (!outcome.success) {
    return { success: false, error: outcome.error };
  }

  // Step 3: Save to disk
  const saved = saveDinoImage(options.dinosaurName, outcome.image);

  return {
    success: true,
    imagePath: saved.imagePath,
    fromCache: false,
  };
}
