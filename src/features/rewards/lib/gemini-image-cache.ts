import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  GeminiGeneratedImage,
  GeminiImageGenerationRequest,
} from "./gemini-image-service";

const DEFAULT_REWARD_IMAGE_DIRECTORY = path.join(process.cwd(), "public", "rewards");
const CACHE_METADATA_SUFFIX = ".metadata.json";
const DEFAULT_CACHE_MODEL = "filesystem-cache";
const inFlightRewardImageGenerations = new Map<string, Promise<GeminiGeneratedImage>>();

const SUPPORTED_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"] as const;
type SupportedImageExtension = (typeof SUPPORTED_IMAGE_EXTENSIONS)[number];

const MIME_TYPE_BY_EXTENSION: Readonly<Record<SupportedImageExtension, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

const MIME_TYPE_TO_EXTENSION: Readonly<Record<string, SupportedImageExtension>> = {
  "image/png": "png",
  "image/jpg": "jpg",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

interface RewardImageCacheMetadata {
  dinosaurName: string;
  prompt: string;
  model: string;
  mimeType: string;
}

export interface FilesystemGeminiImageCacheOptions {
  outputDirectory?: string;
}

export interface CachedRewardImageFile {
  absolutePath: string;
  extension: SupportedImageExtension;
}

export type GeminiRewardImagePrefetchStatus =
  | "already-cached"
  | "already-in-flight"
  | "started";

type JsonObject = Record<string, unknown>;

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null;
}

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeDinosaurName(dinosaurName: string): string {
  const normalizedName = getTrimmedNonEmptyString(dinosaurName);

  if (!normalizedName) {
    throw new Error("dinosaurName must be a non-empty string.");
  }

  return normalizedName;
}

function resolveOutputDirectory(options: FilesystemGeminiImageCacheOptions): string {
  const configuredOutputDirectory = getTrimmedNonEmptyString(options.outputDirectory);
  return configuredOutputDirectory ?? DEFAULT_REWARD_IMAGE_DIRECTORY;
}

function toInFlightRewardImageGenerationKey(
  dinosaurName: string,
  options: FilesystemGeminiImageCacheOptions,
): string {
  const slug = toRewardImageCacheSlug(dinosaurName);
  const outputDirectory = path.resolve(resolveOutputDirectory(options));
  return `${outputDirectory}:${slug}`;
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function getCacheMetadataPath(absoluteImagePath: string): string {
  return `${absoluteImagePath}${CACHE_METADATA_SUFFIX}`;
}

function getMimeTypeForExtension(extension: SupportedImageExtension): string {
  return MIME_TYPE_BY_EXTENSION[extension];
}

function getExtensionForMimeType(mimeType: string): SupportedImageExtension {
  const normalizedMimeType = getTrimmedNonEmptyString(mimeType)?.toLowerCase() ?? "";
  return MIME_TYPE_TO_EXTENSION[normalizedMimeType] ?? "png";
}

function toFallbackCachedPrompt(dinosaurName: string): string {
  return `Cached dinosaur reward image for ${dinosaurName}.`;
}

function readMetadataString(value: unknown, fallback: string): string {
  return getTrimmedNonEmptyString(value) ?? fallback;
}

function asRewardImageCacheMetadata(
  parsedValue: unknown,
  dinosaurName: string,
  mimeType: string,
): RewardImageCacheMetadata {
  if (!isRecord(parsedValue)) {
    return {
      dinosaurName,
      prompt: toFallbackCachedPrompt(dinosaurName),
      model: DEFAULT_CACHE_MODEL,
      mimeType,
    };
  }

  const parsedDinosaurName = readMetadataString(parsedValue.dinosaurName, dinosaurName);
  return {
    dinosaurName: parsedDinosaurName,
    prompt: readMetadataString(parsedValue.prompt, toFallbackCachedPrompt(parsedDinosaurName)),
    model: readMetadataString(parsedValue.model, DEFAULT_CACHE_MODEL),
    mimeType: readMetadataString(parsedValue.mimeType, mimeType),
  };
}

async function readRewardImageCacheMetadata(
  absoluteImagePath: string,
  dinosaurName: string,
  mimeType: string,
): Promise<RewardImageCacheMetadata> {
  const metadataPath = getCacheMetadataPath(absoluteImagePath);

  try {
    const rawMetadata = await readFile(metadataPath, "utf8");
    return asRewardImageCacheMetadata(JSON.parse(rawMetadata), dinosaurName, mimeType);
  } catch {
    return asRewardImageCacheMetadata(null, dinosaurName, mimeType);
  }
}

export function toRewardImageCacheSlug(dinosaurName: string): string {
  const normalizedName = normalizeDinosaurName(dinosaurName);
  const slug = normalizedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0) {
    throw new Error("dinosaurName must include alphanumeric characters.");
  }

  return slug;
}

export async function findCachedRewardImageFile(
  dinosaurName: string,
  options: FilesystemGeminiImageCacheOptions = {},
): Promise<CachedRewardImageFile | null> {
  const slug = toRewardImageCacheSlug(dinosaurName);
  const outputDirectory = resolveOutputDirectory(options);

  for (const extension of SUPPORTED_IMAGE_EXTENSIONS) {
    const absolutePath = path.join(outputDirectory, `${slug}.${extension}`);

    try {
      await access(absolutePath);
      return {
        absolutePath,
        extension,
      };
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  return null;
}

export async function doesRewardImageExistOnDisk(
  dinosaurName: string,
  options: FilesystemGeminiImageCacheOptions = {},
): Promise<boolean> {
  const cachedFile = await findCachedRewardImageFile(dinosaurName, options);
  return cachedFile !== null;
}

export async function readCachedGeminiRewardImage(
  dinosaurName: string,
  options: FilesystemGeminiImageCacheOptions = {},
): Promise<GeminiGeneratedImage | null> {
  const normalizedDinosaurName = normalizeDinosaurName(dinosaurName);
  const cachedFile = await findCachedRewardImageFile(normalizedDinosaurName, options);

  if (!cachedFile) {
    return null;
  }

  const imageBuffer = await readFile(cachedFile.absolutePath);
  const fallbackMimeType = getMimeTypeForExtension(cachedFile.extension);
  const metadata = await readRewardImageCacheMetadata(
    cachedFile.absolutePath,
    normalizedDinosaurName,
    fallbackMimeType,
  );

  return {
    dinosaurName: metadata.dinosaurName,
    prompt: metadata.prompt,
    model: metadata.model,
    mimeType: metadata.mimeType,
    imageBase64: imageBuffer.toString("base64"),
  };
}

export async function persistGeminiRewardImageToFilesystemCache(
  image: GeminiGeneratedImage,
  options: FilesystemGeminiImageCacheOptions = {},
): Promise<string> {
  const normalizedDinosaurName = normalizeDinosaurName(image.dinosaurName);
  const outputDirectory = resolveOutputDirectory(options);
  const extension = getExtensionForMimeType(image.mimeType);
  const absoluteImagePath = path.join(
    outputDirectory,
    `${toRewardImageCacheSlug(normalizedDinosaurName)}.${extension}`,
  );
  const metadataPath = getCacheMetadataPath(absoluteImagePath);
  const imageBuffer = Buffer.from(image.imageBase64, "base64");

  await mkdir(outputDirectory, { recursive: true });
  await writeFile(absoluteImagePath, imageBuffer);

  const metadata: RewardImageCacheMetadata = {
    dinosaurName: normalizedDinosaurName,
    prompt: getTrimmedNonEmptyString(image.prompt) ?? toFallbackCachedPrompt(normalizedDinosaurName),
    model: getTrimmedNonEmptyString(image.model) ?? DEFAULT_CACHE_MODEL,
    mimeType: getTrimmedNonEmptyString(image.mimeType) ?? getMimeTypeForExtension(extension),
  };
  await writeFile(metadataPath, JSON.stringify(metadata), "utf8");

  return absoluteImagePath;
}

function startInFlightRewardImageGeneration(
  dinosaurName: string,
  generateImage: (request: GeminiImageGenerationRequest) => Promise<GeminiGeneratedImage>,
  options: FilesystemGeminiImageCacheOptions,
): Promise<GeminiGeneratedImage> {
  const inFlightGenerationKey = toInFlightRewardImageGenerationKey(dinosaurName, options);
  const generationPromise = (async () => {
    const generatedImage = await generateImage({ dinosaurName });
    await persistGeminiRewardImageToFilesystemCache(generatedImage, options);
    return generatedImage;
  })();

  inFlightRewardImageGenerations.set(inFlightGenerationKey, generationPromise);

  void generationPromise
    .catch(() => undefined)
    .finally(() => {
      if (inFlightRewardImageGenerations.get(inFlightGenerationKey) === generationPromise) {
        inFlightRewardImageGenerations.delete(inFlightGenerationKey);
      }
    });

  return generationPromise;
}

function getInFlightRewardImageGeneration(
  dinosaurName: string,
  options: FilesystemGeminiImageCacheOptions,
): Promise<GeminiGeneratedImage> | undefined {
  const inFlightGenerationKey = toInFlightRewardImageGenerationKey(dinosaurName, options);
  return inFlightRewardImageGenerations.get(inFlightGenerationKey);
}

export async function prefetchGeminiRewardImageWithFilesystemCache(
  request: GeminiImageGenerationRequest,
  generateImage: (request: GeminiImageGenerationRequest) => Promise<GeminiGeneratedImage>,
  options: FilesystemGeminiImageCacheOptions = {},
): Promise<GeminiRewardImagePrefetchStatus> {
  const normalizedDinosaurName = normalizeDinosaurName(request.dinosaurName);
  const rewardImageExistsOnDisk = await doesRewardImageExistOnDisk(normalizedDinosaurName, options);

  if (rewardImageExistsOnDisk) {
    return "already-cached";
  }

  const inFlightGeneration = getInFlightRewardImageGeneration(normalizedDinosaurName, options);

  if (inFlightGeneration) {
    return "already-in-flight";
  }

  startInFlightRewardImageGeneration(normalizedDinosaurName, generateImage, options);
  return "started";
}

export async function resolveGeminiRewardImageWithFilesystemCache(
  request: GeminiImageGenerationRequest,
  generateImage: (request: GeminiImageGenerationRequest) => Promise<GeminiGeneratedImage>,
  options: FilesystemGeminiImageCacheOptions = {},
): Promise<GeminiGeneratedImage> {
  const normalizedDinosaurName = normalizeDinosaurName(request.dinosaurName);
  const cachedImage = await readCachedGeminiRewardImage(normalizedDinosaurName, options);

  if (cachedImage) {
    return cachedImage;
  }

  const inFlightGeneration = getInFlightRewardImageGeneration(normalizedDinosaurName, options);

  if (inFlightGeneration) {
    return inFlightGeneration;
  }

  return startInFlightRewardImageGeneration(normalizedDinosaurName, generateImage, options);
}
