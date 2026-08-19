/**
 * Reward image cache: binaries live in object storage (Cloudflare R2), and the
 * database keeps a row for every image ever created (`reward_images`) plus the
 * current image / generation status per reward slug (`reward_image_states`).
 * In-flight generation is tracked in memory so concurrent requests for the
 * same reward share one render.
 */

import { createHash, randomUUID } from "node:crypto";

import {
  executeDatabaseBatch,
  executeDatabaseStatement,
  getDatabaseLocation,
  type DatabaseLocationSnapshot,
  type DatabaseRow,
} from "@/features/persistence/lib/database";
import {
  getDefaultRewardImageStorage,
  type RewardImageStorage,
} from "@/features/persistence/lib/object-storage";

import type {
  GeneratedRewardImage,
  RewardImageGenerationRequest,
  RewardImageSource,
} from "./reward-image-service";
import {
  REWARD_IMAGE_EXTENSIONS,
  parseRewardImageFileName,
  toRewardImageCacheSlug,
  type RewardImageExtension,
} from "./reward-image-slug";

const DEFAULT_CACHE_MODEL = "unknown-model";
/** A persisted "generating" flag older than this is considered abandoned. */
const GENERATING_STATUS_TTL_MS = 5 * 60 * 1000;
const inFlightRewardImageGenerations = new Map<string, Promise<GeneratedRewardImage>>();

const SUPPORTED_IMAGE_EXTENSIONS = REWARD_IMAGE_EXTENSIONS;
export type SupportedImageExtension = RewardImageExtension;

export { parseRewardImageFileName, toRewardImageCacheSlug };

const MIME_TYPE_BY_EXTENSION: Readonly<Record<SupportedImageExtension, string>> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

const MIME_TYPE_TO_EXTENSION: Readonly<Record<string, SupportedImageExtension>> = {
  "image/png": "png",
  "image/jpg": "jpg",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

export type RewardImageGenerationStatus = "ready" | "generating" | "missing";

export type { RewardImageSource } from "./reward-image-service";

export interface RewardImageCacheOptions {
  /** Object storage backend; defaults to R2 (or the local fallback) from the environment. */
  storage?: RewardImageStorage;
}

export interface PersistRewardImageOptions extends RewardImageCacheOptions {
  /** Creation timestamp override (used by migrations to keep original times). */
  createdAtMs?: number;
  /** Source override; otherwise inferred from the image envelope. */
  source?: RewardImageSource;
}

/** One row of `reward_images`: an image that was created and uploaded. */
export interface RewardImageRecord {
  id: string;
  slug: string;
  dinosaurName: string;
  prompt: string;
  model: string;
  mimeType: string;
  extension: SupportedImageExtension;
  storageKey: string;
  byteSize: number;
  sha256: string;
  source: RewardImageSource;
  createdAtMs: number;
  /** URL the browser should load: R2 public URL when configured, else the app proxy path. */
  imagePath: string;
}

export interface RewardImageGenerationStatusSnapshot {
  dinosaurName: string;
  status: RewardImageGenerationStatus;
  imagePath: string | null;
}

export type RewardImagePrefetchStatus =
  | "already-cached"
  | "already-in-flight"
  | "started";

export type RewardCacheDatabaseLocationSnapshot = DatabaseLocationSnapshot;

/** Current state of one reward slug joined with its live image (if any). */
export interface RewardImageCacheDatabaseRecord {
  slug: string;
  dinosaurName: string;
  status: RewardImageGenerationStatus;
  statusUpdatedAtMs: number;
  imageId: string | null;
  prompt: string | null;
  model: string | null;
  mimeType: string | null;
  extension: SupportedImageExtension | null;
  storageKey: string | null;
  byteSize: number | null;
  sha256: string | null;
  source: RewardImageSource | null;
  imagePath: string | null;
  updatedAtMs: number;
}

export interface DeleteRewardImageCacheEntryResult {
  dinosaurName: string;
  deletedDatabaseRecord: boolean;
  deletedImageCount: number;
  deletedStorageKeys: readonly string[];
}

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toNonNegativeInteger(value: unknown): number | null {
  const numericValue = typeof value === "bigint" ? Number(value) : value;
  if (typeof numericValue !== "number" || !Number.isFinite(numericValue)) {
    return null;
  }

  return Math.max(0, Math.floor(numericValue));
}

function normalizeDinosaurName(dinosaurName: string): string {
  const normalizedName = getTrimmedNonEmptyString(dinosaurName);

  if (!normalizedName) {
    throw new Error("dinosaurName must be a non-empty string.");
  }

  return normalizedName;
}

function resolveStorage(options: RewardImageCacheOptions): RewardImageStorage {
  return options.storage ?? getDefaultRewardImageStorage();
}

function toInFlightRewardImageGenerationKey(
  dinosaurName: string,
  storage: RewardImageStorage,
): string {
  return `${storage.id}:${toRewardImageCacheSlug(dinosaurName)}`;
}

export function getRewardCacheDatabaseLocation(): RewardCacheDatabaseLocationSnapshot {
  return getDatabaseLocation();
}

export function getMimeTypeForExtension(extension: SupportedImageExtension): string {
  return MIME_TYPE_BY_EXTENSION[extension];
}

export function getExtensionForMimeType(mimeType: string): SupportedImageExtension {
  const normalizedMimeType = getTrimmedNonEmptyString(mimeType)?.toLowerCase() ?? "";
  return MIME_TYPE_TO_EXTENSION[normalizedMimeType] ?? "png";
}

export function toSupportedImageExtension(
  extension: unknown,
  fallbackMimeType: string,
): SupportedImageExtension {
  const normalizedExtension = getTrimmedNonEmptyString(extension)?.toLowerCase();
  if (
    normalizedExtension &&
    SUPPORTED_IMAGE_EXTENSIONS.includes(normalizedExtension as SupportedImageExtension)
  ) {
    return normalizedExtension as SupportedImageExtension;
  }

  return getExtensionForMimeType(fallbackMimeType);
}

function toFallbackCachedPrompt(dinosaurName: string): string {
  return `Cached dinosaur reward image for ${dinosaurName}.`;
}

function normalizeRewardImageSource(value: unknown): RewardImageSource {
  return value === "openai" ||
    value === "fallback-svg" ||
    value === "filesystem-migration" ||
    value === "unknown"
    ? value
    : "unknown";
}

function inferRewardImageSource(image: GeneratedRewardImage): RewardImageSource {
  if (image.source) {
    return image.source;
  }

  return image.model === "local-fallback-svg" ? "fallback-svg" : "openai";
}

function normalizeGenerationStatus(value: unknown): RewardImageGenerationStatus | null {
  if (value === "ready" || value === "generating" || value === "missing") {
    return value;
  }

  return null;
}

/**
 * Browser-facing path for an image: the object's public R2 URL when the bucket
 * is exposed, otherwise the app route that streams it (`/rewards/<slug>.<ext>`).
 */
export function toRewardImagePublicPath(
  image: Pick<RewardImageRecord, "slug" | "extension" | "storageKey" | "createdAtMs">,
  storage: RewardImageStorage,
): string {
  const publicUrl = storage.toPublicUrl(image.storageKey);
  if (publicUrl) {
    return publicUrl;
  }

  return `/rewards/${image.slug}.${image.extension}?v=${image.createdAtMs}`;
}

function createRewardImageId(createdAtMs: number): string {
  return `${createdAtMs}-${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function toRewardImageStorageKey(
  storage: RewardImageStorage,
  slug: string,
  imageId: string,
  extension: SupportedImageExtension,
): string {
  return `${storage.keyPrefix}/${slug}/${imageId}.${extension}`;
}

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

const REWARD_IMAGE_COLUMNS = `
  images.id AS image_id,
  images.slug AS image_slug,
  images.dinosaur_name AS image_dinosaur_name,
  images.prompt AS image_prompt,
  images.model AS image_model,
  images.mime_type AS image_mime_type,
  images.extension AS image_extension,
  images.storage_key AS image_storage_key,
  images.byte_size AS image_byte_size,
  images.sha256 AS image_sha256,
  images.source AS image_source,
  images.created_at_ms AS image_created_at_ms
`;

function toRewardImageRecordFromRow(
  row: DatabaseRow,
  storage: RewardImageStorage,
): RewardImageRecord | null {
  const id = getTrimmedNonEmptyString(row.image_id);
  const slug = getTrimmedNonEmptyString(row.image_slug);
  const dinosaurName = getTrimmedNonEmptyString(row.image_dinosaur_name);
  const storageKey = getTrimmedNonEmptyString(row.image_storage_key);
  if (!id || !slug || !dinosaurName || !storageKey) {
    return null;
  }

  const mimeType = getTrimmedNonEmptyString(row.image_mime_type) ?? "image/png";
  const extension = toSupportedImageExtension(row.image_extension, mimeType);
  const createdAtMs = toNonNegativeInteger(row.image_created_at_ms) ?? 0;

  return {
    id,
    slug,
    dinosaurName,
    prompt: getTrimmedNonEmptyString(row.image_prompt) ?? toFallbackCachedPrompt(dinosaurName),
    model: getTrimmedNonEmptyString(row.image_model) ?? DEFAULT_CACHE_MODEL,
    mimeType,
    extension,
    storageKey,
    byteSize: toNonNegativeInteger(row.image_byte_size) ?? 0,
    sha256: getTrimmedNonEmptyString(row.image_sha256) ?? "",
    source: normalizeRewardImageSource(row.image_source),
    createdAtMs,
    imagePath: toRewardImagePublicPath({ slug, extension, storageKey, createdAtMs }, storage),
  };
}

function toDatabaseRecordFromRow(
  row: DatabaseRow,
  storage: RewardImageStorage,
): RewardImageCacheDatabaseRecord | null {
  const slug = getTrimmedNonEmptyString(row.state_slug);
  const dinosaurName = getTrimmedNonEmptyString(row.state_dinosaur_name);
  if (!slug || !dinosaurName) {
    return null;
  }

  const image = toRewardImageRecordFromRow(row, storage);
  const persistedStatus = normalizeGenerationStatus(row.state_status) ?? "missing";
  const statusUpdatedAtMs = toNonNegativeInteger(row.state_updated_at_ms) ?? 0;
  const status: RewardImageGenerationStatus = image
    ? "ready"
    : persistedStatus === "generating" && Date.now() - statusUpdatedAtMs <= GENERATING_STATUS_TTL_MS
      ? "generating"
      : "missing";

  return {
    slug,
    dinosaurName,
    status,
    statusUpdatedAtMs,
    imageId: image?.id ?? null,
    prompt: image?.prompt ?? null,
    model: image?.model ?? null,
    mimeType: image?.mimeType ?? null,
    extension: image?.extension ?? null,
    storageKey: image?.storageKey ?? null,
    byteSize: image?.byteSize ?? null,
    sha256: image?.sha256 ?? null,
    source: image?.source ?? null,
    imagePath: image?.imagePath ?? null,
    updatedAtMs: image?.createdAtMs ?? statusUpdatedAtMs,
  };
}

// ---------------------------------------------------------------------------
// Database access
// ---------------------------------------------------------------------------

async function readStateRow(slug: string): Promise<DatabaseRow | null> {
  const result = await executeDatabaseStatement({
    sql: `
      SELECT
        states.slug AS state_slug,
        states.dinosaur_name AS state_dinosaur_name,
        states.status AS state_status,
        states.updated_at_ms AS state_updated_at_ms,
        ${REWARD_IMAGE_COLUMNS}
      FROM reward_image_states AS states
      LEFT JOIN reward_images AS images
        ON images.id = states.current_image_id
      WHERE states.slug = ?
      LIMIT 1
    `,
    args: [slug],
  });

  return result.rows[0] ?? null;
}

async function writeRewardImageState(input: {
  slug: string;
  dinosaurName: string;
  status: RewardImageGenerationStatus;
  currentImageId: string | null;
  updatedAtMs: number;
}): Promise<void> {
  await executeDatabaseStatement({
    sql: `
      INSERT INTO reward_image_states (
        slug,
        dinosaur_name,
        status,
        current_image_id,
        updated_at_ms
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        dinosaur_name = excluded.dinosaur_name,
        status = excluded.status,
        current_image_id = excluded.current_image_id,
        updated_at_ms = excluded.updated_at_ms
    `,
    args: [input.slug, input.dinosaurName, input.status, input.currentImageId, input.updatedAtMs],
  });
}

async function safelyWriteRewardImageState(
  input: Parameters<typeof writeRewardImageState>[0],
): Promise<void> {
  try {
    await writeRewardImageState(input);
  } catch (error) {
    console.warn("[rewards] failed to persist reward image state", {
      slug: input.slug,
      status: input.status,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Current live image for a reward, or null when none is recorded. */
export async function findCurrentRewardImage(
  dinosaurName: string,
  options: RewardImageCacheOptions = {},
): Promise<RewardImageRecord | null> {
  const slug = toRewardImageCacheSlug(dinosaurName);
  const row = await readStateRow(slug);
  return row ? toRewardImageRecordFromRow(row, resolveStorage(options)) : null;
}

/** Looks up an already-recorded image with identical bytes for this reward. */
export async function findRewardImageBySha256(
  dinosaurName: string,
  sha256: string,
  options: RewardImageCacheOptions = {},
): Promise<RewardImageRecord | null> {
  const slug = toRewardImageCacheSlug(dinosaurName);
  const result = await executeDatabaseStatement({
    sql: `
      SELECT ${REWARD_IMAGE_COLUMNS}
      FROM reward_images AS images
      WHERE images.slug = ? AND images.sha256 = ?
      ORDER BY images.created_at_ms DESC
      LIMIT 1
    `,
    args: [slug, sha256],
  });

  const row = result.rows[0];
  return row ? toRewardImageRecordFromRow(row, resolveStorage(options)) : null;
}

/** Every image ever created for a reward, newest first. */
export async function listRewardImageHistory(
  dinosaurName: string,
  options: RewardImageCacheOptions = {},
): Promise<readonly RewardImageRecord[]> {
  const slug = toRewardImageCacheSlug(dinosaurName);
  const storage = resolveStorage(options);
  const result = await executeDatabaseStatement({
    sql: `
      SELECT ${REWARD_IMAGE_COLUMNS}
      FROM reward_images AS images
      WHERE images.slug = ?
      ORDER BY images.created_at_ms DESC, images.id DESC
    `,
    args: [slug],
  });

  return result.rows
    .map((row) => toRewardImageRecordFromRow(row, storage))
    .filter((record): record is RewardImageRecord => record !== null);
}

export async function doesRewardImageExist(
  dinosaurName: string,
  options: RewardImageCacheOptions = {},
): Promise<boolean> {
  return (await findCurrentRewardImage(dinosaurName, options)) !== null;
}

/**
 * Loads the current image bytes for a reward. When the database points at an
 * object that is gone from storage the state is reset to `missing` so the next
 * request regenerates instead of failing forever.
 */
export async function readCachedRewardImage(
  dinosaurName: string,
  options: RewardImageCacheOptions = {},
): Promise<GeneratedRewardImage | null> {
  const normalizedDinosaurName = normalizeDinosaurName(dinosaurName);
  const storage = resolveStorage(options);
  const currentImage = await findCurrentRewardImage(normalizedDinosaurName, options);
  if (!currentImage) {
    return null;
  }

  const storedObject = await storage.getObject(currentImage.storageKey);
  if (!storedObject) {
    console.warn("[rewards] current reward image is missing from storage; resetting state", {
      slug: currentImage.slug,
      storageKey: currentImage.storageKey,
    });
    await safelyWriteRewardImageState({
      slug: currentImage.slug,
      dinosaurName: currentImage.dinosaurName,
      status: "missing",
      currentImageId: null,
      updatedAtMs: Date.now(),
    });
    return null;
  }

  return {
    dinosaurName: currentImage.dinosaurName,
    prompt: currentImage.prompt,
    model: currentImage.model,
    mimeType: currentImage.mimeType,
    imageBase64: Buffer.from(storedObject.body).toString("base64"),
    source: currentImage.source,
  };
}

export async function getRewardImageGenerationStatus(
  dinosaurName: string,
  options: RewardImageCacheOptions = {},
): Promise<RewardImageGenerationStatusSnapshot> {
  const normalizedDinosaurName = normalizeDinosaurName(dinosaurName);
  const storage = resolveStorage(options);
  const slug = toRewardImageCacheSlug(normalizedDinosaurName);

  let record: RewardImageCacheDatabaseRecord | null = null;
  try {
    const row = await readStateRow(slug);
    record = row ? toDatabaseRecordFromRow(row, storage) : null;
  } catch (error) {
    console.warn("[rewards] failed to read reward image state", {
      slug,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  if (record?.status === "ready" && record.imagePath) {
    return {
      dinosaurName: normalizedDinosaurName,
      status: "ready",
      imagePath: record.imagePath,
    };
  }

  const inFlightGeneration = getInFlightRewardImageGeneration(normalizedDinosaurName, storage);
  if (inFlightGeneration || record?.status === "generating") {
    return {
      dinosaurName: normalizedDinosaurName,
      status: "generating",
      imagePath: null,
    };
  }

  return {
    dinosaurName: normalizedDinosaurName,
    status: "missing",
    imagePath: null,
  };
}

/**
 * Status for many rewards in a single query. Reads only `reward_image_states`
 * (joined to the current image row) — it never fetches image bytes, so it stays
 * cheap no matter how many rewards a player has unlocked.
 */
export async function getRewardImageGenerationStatuses(
  dinosaurNames: readonly string[],
  options: RewardImageCacheOptions = {},
): Promise<readonly RewardImageGenerationStatusSnapshot[]> {
  const storage = resolveStorage(options);
  const requestedNames = dinosaurNames
    .map((dinosaurName) => getTrimmedNonEmptyString(dinosaurName))
    .filter((dinosaurName): dinosaurName is string => dinosaurName !== null);

  if (requestedNames.length === 0) {
    return [];
  }

  const slugByName = new Map<string, string>();
  for (const dinosaurName of requestedNames) {
    slugByName.set(dinosaurName, toRewardImageCacheSlug(dinosaurName));
  }

  const uniqueSlugs = [...new Set(slugByName.values())];
  const recordBySlug = new Map<string, RewardImageCacheDatabaseRecord>();

  try {
    const placeholders = uniqueSlugs.map(() => "?").join(", ");
    const result = await executeDatabaseStatement({
      sql: `
        SELECT
          states.slug AS state_slug,
          states.dinosaur_name AS state_dinosaur_name,
          states.status AS state_status,
          states.updated_at_ms AS state_updated_at_ms,
          ${REWARD_IMAGE_COLUMNS}
        FROM reward_image_states AS states
        LEFT JOIN reward_images AS images
          ON images.id = states.current_image_id
        WHERE states.slug IN (${placeholders})
      `,
      args: uniqueSlugs,
    });

    for (const row of result.rows) {
      const record = toDatabaseRecordFromRow(row, storage);
      if (record) {
        recordBySlug.set(record.slug, record);
      }
    }
  } catch (error) {
    console.warn("[rewards] failed to read reward image states in bulk", {
      count: uniqueSlugs.length,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  return requestedNames.map((dinosaurName) => {
    const record = recordBySlug.get(slugByName.get(dinosaurName) ?? "");

    if (record?.status === "ready" && record.imagePath) {
      return { dinosaurName, status: "ready", imagePath: record.imagePath };
    }

    if (getInFlightRewardImageGeneration(dinosaurName, storage) || record?.status === "generating") {
      return { dinosaurName, status: "generating", imagePath: null };
    }

    return { dinosaurName, status: "missing", imagePath: null };
  });
}

/**
 * Uploads an image to object storage and records it: a new `reward_images`
 * row (history is append-only) and the slug's state pointing at it.
 */
export async function persistRewardImage(
  image: GeneratedRewardImage,
  options: PersistRewardImageOptions = {},
): Promise<RewardImageRecord> {
  const normalizedDinosaurName = normalizeDinosaurName(image.dinosaurName);
  const storage = resolveStorage(options);
  const slug = toRewardImageCacheSlug(normalizedDinosaurName);
  const extension = getExtensionForMimeType(image.mimeType);
  const mimeType = getTrimmedNonEmptyString(image.mimeType) ?? getMimeTypeForExtension(extension);
  const imageBuffer = Buffer.from(image.imageBase64, "base64");
  const createdAtMs = toNonNegativeInteger(options.createdAtMs) ?? Date.now();
  const id = createRewardImageId(createdAtMs);
  const storageKey = toRewardImageStorageKey(storage, slug, id, extension);
  const sha256 = createHash("sha256").update(imageBuffer).digest("hex");
  const prompt = getTrimmedNonEmptyString(image.prompt) ?? toFallbackCachedPrompt(normalizedDinosaurName);
  const model = getTrimmedNonEmptyString(image.model) ?? DEFAULT_CACHE_MODEL;
  const source = options.source ?? inferRewardImageSource(image);

  await storage.putObject({
    key: storageKey,
    body: new Uint8Array(imageBuffer),
    contentType: mimeType,
  });

  await executeDatabaseBatch([
    {
      sql: `
        INSERT INTO reward_images (
          id,
          slug,
          dinosaur_name,
          prompt,
          model,
          mime_type,
          extension,
          storage_key,
          byte_size,
          sha256,
          source,
          created_at_ms
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        id,
        slug,
        normalizedDinosaurName,
        prompt,
        model,
        mimeType,
        extension,
        storageKey,
        imageBuffer.byteLength,
        sha256,
        source,
        createdAtMs,
      ],
    },
    {
      sql: `
        INSERT INTO reward_image_states (
          slug,
          dinosaur_name,
          status,
          current_image_id,
          updated_at_ms
        )
        VALUES (?, ?, 'ready', ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          dinosaur_name = excluded.dinosaur_name,
          status = 'ready',
          current_image_id = excluded.current_image_id,
          updated_at_ms = excluded.updated_at_ms
      `,
      args: [slug, normalizedDinosaurName, id, createdAtMs],
    },
  ]);

  return {
    id,
    slug,
    dinosaurName: normalizedDinosaurName,
    prompt,
    model,
    mimeType,
    extension,
    storageKey,
    byteSize: imageBuffer.byteLength,
    sha256,
    source,
    createdAtMs,
    imagePath: toRewardImagePublicPath({ slug, extension, storageKey, createdAtMs }, storage),
  };
}

function startInFlightRewardImageGeneration(
  request: RewardImageGenerationRequest,
  generateImage: (request: RewardImageGenerationRequest) => Promise<GeneratedRewardImage>,
  options: RewardImageCacheOptions,
): Promise<GeneratedRewardImage> {
  const dinosaurName = normalizeDinosaurName(request.dinosaurName);
  const storage = resolveStorage(options);
  const slug = toRewardImageCacheSlug(dinosaurName);
  const inFlightGenerationKey = toInFlightRewardImageGenerationKey(dinosaurName, storage);
  const generationPromise = (async () => {
    await safelyWriteRewardImageState({
      slug,
      dinosaurName,
      status: "generating",
      currentImageId: null,
      updatedAtMs: Date.now(),
    });

    try {
      // Forward the whole request so the dossier block and any model override
      // reach the generator, not just the name.
      const generatedImage = await generateImage({ ...request, dinosaurName });
      await persistRewardImage(generatedImage, { storage });
      return generatedImage;
    } catch (error) {
      await safelyWriteRewardImageState({
        slug,
        dinosaurName,
        status: "missing",
        currentImageId: null,
        updatedAtMs: Date.now(),
      });
      throw error;
    }
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
  storage: RewardImageStorage,
): Promise<GeneratedRewardImage> | undefined {
  return inFlightRewardImageGenerations.get(toInFlightRewardImageGenerationKey(dinosaurName, storage));
}

export async function prefetchRewardImage(
  request: RewardImageGenerationRequest,
  generateImage: (request: RewardImageGenerationRequest) => Promise<GeneratedRewardImage>,
  options: RewardImageCacheOptions = {},
): Promise<RewardImagePrefetchStatus> {
  const normalizedDinosaurName = normalizeDinosaurName(request.dinosaurName);
  const storage = resolveStorage(options);

  if (await doesRewardImageExist(normalizedDinosaurName, { storage })) {
    return "already-cached";
  }

  if (getInFlightRewardImageGeneration(normalizedDinosaurName, storage)) {
    return "already-in-flight";
  }

  startInFlightRewardImageGeneration(request, generateImage, { storage });
  return "started";
}

export async function resolveRewardImageWithCache(
  request: RewardImageGenerationRequest,
  generateImage: (request: RewardImageGenerationRequest) => Promise<GeneratedRewardImage>,
  options: RewardImageCacheOptions = {},
): Promise<GeneratedRewardImage> {
  const normalizedDinosaurName = normalizeDinosaurName(request.dinosaurName);
  const storage = resolveStorage(options);
  const cachedImage = await readCachedRewardImage(normalizedDinosaurName, { storage });

  if (cachedImage) {
    return cachedImage;
  }

  const inFlightGeneration = getInFlightRewardImageGeneration(normalizedDinosaurName, storage);
  if (inFlightGeneration) {
    return inFlightGeneration;
  }

  return startInFlightRewardImageGeneration(request, generateImage, { storage });
}

export async function listRewardImageCacheDatabaseRecords(
  options: RewardImageCacheOptions = {},
): Promise<readonly RewardImageCacheDatabaseRecord[]> {
  const storage = resolveStorage(options);

  try {
    const result = await executeDatabaseStatement({
      sql: `
        SELECT
          states.slug AS state_slug,
          states.dinosaur_name AS state_dinosaur_name,
          states.status AS state_status,
          states.updated_at_ms AS state_updated_at_ms,
          ${REWARD_IMAGE_COLUMNS}
        FROM reward_image_states AS states
        LEFT JOIN reward_images AS images
          ON images.id = states.current_image_id
        ORDER BY states.updated_at_ms DESC, states.dinosaur_name COLLATE NOCASE ASC
      `,
      args: [],
    });

    return result.rows
      .map((row) => toDatabaseRecordFromRow(row, storage))
      .filter((record): record is RewardImageCacheDatabaseRecord => record !== null);
  } catch (error) {
    console.warn("[rewards] failed to list reward image records", {
      reason: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

export async function getRewardImageCacheDatabaseRecord(
  dinosaurName: string,
  options: RewardImageCacheOptions = {},
): Promise<RewardImageCacheDatabaseRecord | null> {
  const slug = toRewardImageCacheSlug(dinosaurName);
  const storage = resolveStorage(options);

  try {
    const row = await readStateRow(slug);
    return row ? toDatabaseRecordFromRow(row, storage) : null;
  } catch (error) {
    console.warn("[rewards] failed to read reward image record", {
      slug,
      reason: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Removes every stored object and database row for a reward and marks the
 * slug as missing so it regenerates on next request.
 */
export async function deleteRewardImageCacheEntry(
  dinosaurName: string,
  options: RewardImageCacheOptions = {},
): Promise<DeleteRewardImageCacheEntryResult> {
  const normalizedDinosaurName = normalizeDinosaurName(dinosaurName);
  const storage = resolveStorage(options);
  const slug = toRewardImageCacheSlug(normalizedDinosaurName);
  const history = await listRewardImageHistory(normalizedDinosaurName, { storage });

  const deletedStorageKeys: string[] = [];
  for (const image of history) {
    await storage.deleteObject(image.storageKey);
    deletedStorageKeys.push(image.storageKey);
  }

  let deletedDatabaseRecord = false;
  try {
    await executeDatabaseBatch([
      { sql: "DELETE FROM reward_images WHERE slug = ?", args: [slug] },
      {
        sql: `
          INSERT INTO reward_image_states (slug, dinosaur_name, status, current_image_id, updated_at_ms)
          VALUES (?, ?, 'missing', NULL, ?)
          ON CONFLICT(slug) DO UPDATE SET
            dinosaur_name = excluded.dinosaur_name,
            status = 'missing',
            current_image_id = NULL,
            updated_at_ms = excluded.updated_at_ms
        `,
        args: [slug, normalizedDinosaurName, Date.now()],
      },
    ]);
    deletedDatabaseRecord = true;
  } catch (error) {
    console.warn("[rewards] failed to delete reward image records", {
      slug,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  return {
    dinosaurName: normalizedDinosaurName,
    deletedDatabaseRecord,
    deletedImageCount: history.length,
    deletedStorageKeys,
  };
}
