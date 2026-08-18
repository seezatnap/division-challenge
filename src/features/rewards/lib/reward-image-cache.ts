import { existsSync, mkdirSync } from "node:fs";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import type {
  GeneratedRewardImage,
  RewardImageGenerationRequest,
} from "./reward-image-service";

const DEFAULT_REWARD_IMAGE_DIRECTORY = path.join(process.cwd(), "public", "rewards");
const CACHE_METADATA_SUFFIX = ".metadata.json";
const DEFAULT_CACHE_MODEL = "filesystem-cache";
const SQLITE_DIRECTORY_NAME = ".sqlite";
const DEFAULT_SQLITE_DATABASE_FILE = "division-challenge.sqlite3";
const inFlightRewardImageGenerations = new Map<string, Promise<GeneratedRewardImage>>();

const SUPPORTED_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "svg"] as const;
type SupportedImageExtension = (typeof SUPPORTED_IMAGE_EXTENSIONS)[number];

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

interface RewardImageCacheMetadata {
  dinosaurName: string;
  prompt: string;
  model: string;
  mimeType: string;
}

export interface FilesystemRewardImageCacheOptions {
  outputDirectory?: string;
}

export interface CachedRewardImageFile {
  absolutePath: string;
  extension: SupportedImageExtension;
  modifiedTimeMs: number;
}

export type RewardImageGenerationStatus = "ready" | "generating" | "missing";

export interface RewardImageGenerationStatusSnapshot {
  dinosaurName: string;
  status: RewardImageGenerationStatus;
  imagePath: string | null;
}

export type RewardImagePrefetchStatus =
  | "already-cached"
  | "already-in-flight"
  | "started";

export interface RewardCacheDatabaseLocationSnapshot {
  projectRoot: string;
  sqliteDirectory: string;
  databaseFile: string;
  databasePath: string;
}

export interface RewardImageCacheDatabaseRecord {
  slug: string;
  dinosaurName: string;
  prompt: string;
  model: string;
  mimeType: string;
  extension: SupportedImageExtension;
  absoluteImagePath: string;
  imagePath: string | null;
  updatedAtMs: number;
  status: RewardImageGenerationStatus;
  statusUpdatedAtMs: number;
}

export interface DeleteRewardImageCacheEntryResult {
  dinosaurName: string;
  deletedDatabaseRecord: boolean;
}

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

function toNonNegativeInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.floor(value));
}

function normalizeDinosaurName(dinosaurName: string): string {
  const normalizedName = getTrimmedNonEmptyString(dinosaurName);

  if (!normalizedName) {
    throw new Error("dinosaurName must be a non-empty string.");
  }

  return normalizedName;
}

function resolveOutputDirectory(options: FilesystemRewardImageCacheOptions): string {
  const configuredOutputDirectory = getTrimmedNonEmptyString(options.outputDirectory);
  return configuredOutputDirectory ?? DEFAULT_REWARD_IMAGE_DIRECTORY;
}

function toInFlightRewardImageGenerationKey(
  dinosaurName: string,
  options: FilesystemRewardImageCacheOptions,
): string {
  const slug = toRewardImageCacheSlug(dinosaurName);
  const outputDirectory = path.resolve(resolveOutputDirectory(options));
  return `${outputDirectory}:${slug}`;
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function resolveGitProjectRootDirectory(startDirectory: string = process.cwd()): string {
  let currentDirectory = path.resolve(startDirectory);

  while (true) {
    if (existsSync(path.join(currentDirectory, ".git"))) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return path.resolve(startDirectory);
    }

    currentDirectory = parentDirectory;
  }
}

function resolveSqliteDatabaseFileName(): string {
  return (
    getTrimmedNonEmptyString(process.env.SQLITE_DB_FILE) ??
    getTrimmedNonEmptyString(process.env.REWARD_CACHE_DB_FILE) ??
    DEFAULT_SQLITE_DATABASE_FILE
  );
}

export function getRewardCacheDatabaseLocation(): RewardCacheDatabaseLocationSnapshot {
  const projectRoot = resolveGitProjectRootDirectory();
  const sqliteDirectory = path.join(projectRoot, SQLITE_DIRECTORY_NAME);
  const databaseFile = resolveSqliteDatabaseFileName();

  return {
    projectRoot,
    sqliteDirectory,
    databaseFile,
    databasePath: path.join(sqliteDirectory, databaseFile),
  };
}

function getCacheMetadataPath(absoluteImagePath: string): string {
  return `${absoluteImagePath}${CACHE_METADATA_SUFFIX}`;
}

function toRewardImagePublicPath(
  dinosaurName: string,
  extension: SupportedImageExtension,
  modifiedTimeMs?: number,
): string {
  const baseImagePath = `/rewards/${toRewardImageCacheSlug(dinosaurName)}.${extension}`;
  if (typeof modifiedTimeMs !== "number" || Number.isNaN(modifiedTimeMs)) {
    return baseImagePath;
  }

  return `${baseImagePath}?v=${Math.max(0, Math.floor(modifiedTimeMs))}`;
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

function toSupportedImageExtension(
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

interface Sqlite3Database {
  run: (
    sql: string,
    params: readonly unknown[],
    callback: (error: Error | null) => void,
  ) => void;
  get: (
    sql: string,
    params: readonly unknown[],
    callback: (error: Error | null, row?: unknown) => void,
  ) => void;
  all: (
    sql: string,
    params: readonly unknown[],
    callback: (error: Error | null, rows?: unknown[]) => void,
  ) => void;
}

interface Sqlite3Driver {
  Database: new (
    filename: string,
    callback: (error: Error | null) => void,
  ) => Sqlite3Database;
  verbose?: () => Sqlite3Driver;
}

interface RewardImageCacheDatabaseMetadataRow {
  dinosaur_name?: unknown;
  prompt?: unknown;
  model?: unknown;
  mime_type?: unknown;
  extension?: unknown;
  absolute_image_path?: unknown;
}

interface RewardImageCacheDatabaseRecordRow {
  slug?: unknown;
  dinosaur_name?: unknown;
  prompt?: unknown;
  model?: unknown;
  mime_type?: unknown;
  extension?: unknown;
  absolute_image_path?: unknown;
  updated_at_ms?: unknown;
  generation_status?: unknown;
  generation_image_path?: unknown;
  generation_updated_at_ms?: unknown;
}

const requireFromWorkspace = createRequire(path.join(process.cwd(), "package.json"));

let sqlite3Driver: Sqlite3Driver | null = null;
let rewardCacheDatabasePromise: Promise<Sqlite3Database> | null = null;

function resolveSqlite3Driver(): Sqlite3Driver {
  if (sqlite3Driver) {
    return sqlite3Driver;
  }

  try {
    const resolvedDriver = requireFromWorkspace("sqlite3") as Sqlite3Driver;
    sqlite3Driver =
      typeof resolvedDriver.verbose === "function" ? resolvedDriver.verbose() : resolvedDriver;
    return sqlite3Driver;
  } catch (cause) {
    throw new Error("The sqlite3 package is required for reward cache persistence.", {
      cause,
    });
  }
}

function runSqliteStatement(
  database: Sqlite3Database,
  sql: string,
  params: readonly unknown[] = [],
): Promise<void> {
  return new Promise((resolve, reject) => {
    database.run(sql, params, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function getSqliteRow<TRow>(
  database: Sqlite3Database,
  sql: string,
  params: readonly unknown[] = [],
): Promise<TRow | null> {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }

      resolve((row ?? null) as TRow | null);
    });
  });
}

function allSqliteRows<TRow>(
  database: Sqlite3Database,
  sql: string,
  params: readonly unknown[] = [],
): Promise<readonly TRow[]> {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }

      resolve((rows ?? []) as readonly TRow[]);
    });
  });
}

async function initializeRewardCacheDatabase(database: Sqlite3Database): Promise<void> {
  await runSqliteStatement(database, "PRAGMA journal_mode = WAL;");
  await runSqliteStatement(database, "PRAGMA foreign_keys = ON;");
  await runSqliteStatement(
    database,
    `
      CREATE TABLE IF NOT EXISTS reward_image_cache (
        slug TEXT PRIMARY KEY,
        dinosaur_name TEXT NOT NULL,
        prompt TEXT NOT NULL,
        model TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        extension TEXT NOT NULL,
        absolute_image_path TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL
      )
    `,
  );
  await runSqliteStatement(
    database,
    `
      CREATE TABLE IF NOT EXISTS reward_image_generation_status (
        slug TEXT PRIMARY KEY,
        dinosaur_name TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ready', 'generating', 'missing')),
        image_path TEXT,
        updated_at_ms INTEGER NOT NULL
      )
    `,
  );
  await runSqliteStatement(
    database,
    `
      CREATE INDEX IF NOT EXISTS reward_image_generation_status_updated_at_idx
      ON reward_image_generation_status(updated_at_ms DESC)
    `,
  );
}

async function getRewardCacheDatabase(): Promise<Sqlite3Database> {
  if (rewardCacheDatabasePromise) {
    return rewardCacheDatabasePromise;
  }

  rewardCacheDatabasePromise = (async () => {
    const databaseLocation = getRewardCacheDatabaseLocation();
    mkdirSync(databaseLocation.sqliteDirectory, { recursive: true });

    const driver = resolveSqlite3Driver();
    const database = await new Promise<Sqlite3Database>((resolve, reject) => {
      const instance = new driver.Database(databaseLocation.databasePath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(instance);
      });
    });

    await initializeRewardCacheDatabase(database);
    return database;
  })();

  try {
    return await rewardCacheDatabasePromise;
  } catch (error) {
    rewardCacheDatabasePromise = null;
    throw error;
  }
}

async function readRewardImageCacheMetadataFromDatabase(
  dinosaurName: string,
  expectedCachedFile: CachedRewardImageFile,
): Promise<RewardImageCacheMetadata | null> {
  const normalizedDinosaurName = normalizeDinosaurName(dinosaurName);

  try {
    const database = await getRewardCacheDatabase();
    const row = await getSqliteRow<RewardImageCacheDatabaseMetadataRow>(
      database,
      `
        SELECT
          dinosaur_name,
          prompt,
          model,
          mime_type,
          extension,
          absolute_image_path
        FROM reward_image_cache
        WHERE slug = ?
        LIMIT 1
      `,
      [toRewardImageCacheSlug(normalizedDinosaurName)],
    );

    if (!row) {
      return null;
    }

    const databaseExtension = toSupportedImageExtension(row.extension, String(row.mime_type ?? ""));
    const databaseAbsoluteImagePath = getTrimmedNonEmptyString(row.absolute_image_path);
    if (
      databaseExtension !== expectedCachedFile.extension ||
      !databaseAbsoluteImagePath ||
      path.resolve(databaseAbsoluteImagePath) !== path.resolve(expectedCachedFile.absolutePath)
    ) {
      return null;
    }

    const mimeType = readMetadataString(row.mime_type, getMimeTypeForExtension(databaseExtension));
    const resolvedDinosaurName = readMetadataString(row.dinosaur_name, normalizedDinosaurName);

    return {
      dinosaurName: resolvedDinosaurName,
      prompt: readMetadataString(row.prompt, toFallbackCachedPrompt(resolvedDinosaurName)),
      model: readMetadataString(row.model, DEFAULT_CACHE_MODEL),
      mimeType,
    };
  } catch {
    return null;
  }
}

async function upsertRewardImageCacheMetadataInDatabase(input: {
  dinosaurName: string;
  prompt: string;
  model: string;
  mimeType: string;
  extension: SupportedImageExtension;
  absoluteImagePath: string;
  updatedAtMs: number;
}): Promise<void> {
  const normalizedDinosaurName = normalizeDinosaurName(input.dinosaurName);
  const normalizedPrompt =
    getTrimmedNonEmptyString(input.prompt) ?? toFallbackCachedPrompt(normalizedDinosaurName);
  const normalizedModel = getTrimmedNonEmptyString(input.model) ?? DEFAULT_CACHE_MODEL;
  const normalizedMimeType =
    getTrimmedNonEmptyString(input.mimeType) ?? getMimeTypeForExtension(input.extension);
  const normalizedAbsoluteImagePath = path.resolve(input.absoluteImagePath);
  const normalizedUpdatedAtMs = toNonNegativeInteger(input.updatedAtMs) ?? Date.now();

  const database = await getRewardCacheDatabase();
  await runSqliteStatement(
    database,
    `
      INSERT INTO reward_image_cache (
        slug,
        dinosaur_name,
        prompt,
        model,
        mime_type,
        extension,
        absolute_image_path,
        updated_at_ms
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        dinosaur_name = excluded.dinosaur_name,
        prompt = excluded.prompt,
        model = excluded.model,
        mime_type = excluded.mime_type,
        extension = excluded.extension,
        absolute_image_path = excluded.absolute_image_path,
        updated_at_ms = excluded.updated_at_ms
    `,
    [
      toRewardImageCacheSlug(normalizedDinosaurName),
      normalizedDinosaurName,
      normalizedPrompt,
      normalizedModel,
      normalizedMimeType,
      input.extension,
      normalizedAbsoluteImagePath,
      normalizedUpdatedAtMs,
    ],
  );
}

function normalizeGenerationStatus(value: unknown): RewardImageGenerationStatus | null {
  if (value === "ready" || value === "generating" || value === "missing") {
    return value;
  }

  return null;
}

async function writeRewardImageGenerationStatusToDatabase(input: {
  dinosaurName: string;
  status: RewardImageGenerationStatus;
  imagePath: string | null;
  updatedAtMs: number;
}): Promise<void> {
  const normalizedDinosaurName = normalizeDinosaurName(input.dinosaurName);
  const database = await getRewardCacheDatabase();
  await runSqliteStatement(
    database,
    `
      INSERT INTO reward_image_generation_status (
        slug,
        dinosaur_name,
        status,
        image_path,
        updated_at_ms
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        dinosaur_name = excluded.dinosaur_name,
        status = excluded.status,
        image_path = excluded.image_path,
        updated_at_ms = excluded.updated_at_ms
    `,
    [
      toRewardImageCacheSlug(normalizedDinosaurName),
      normalizedDinosaurName,
      input.status,
      input.imagePath,
      toNonNegativeInteger(input.updatedAtMs) ?? Date.now(),
    ],
  );
}

async function safelyWriteRewardImageGenerationStatusToDatabase(input: {
  dinosaurName: string;
  status: RewardImageGenerationStatus;
  imagePath: string | null;
  updatedAtMs: number;
}): Promise<void> {
  try {
    await writeRewardImageGenerationStatusToDatabase(input);
  } catch {
    // Keep filesystem cache behavior operational when sqlite status writes fail.
  }
}

async function removeRewardImageCacheDatabaseEntries(dinosaurName: string): Promise<boolean> {
  const normalizedDinosaurName = normalizeDinosaurName(dinosaurName);

  try {
    const database = await getRewardCacheDatabase();
    const slug = toRewardImageCacheSlug(normalizedDinosaurName);
    await runSqliteStatement(
      database,
      `
        DELETE FROM reward_image_generation_status
        WHERE slug = ?
      `,
      [slug],
    );
    await runSqliteStatement(
      database,
      `
        DELETE FROM reward_image_cache
        WHERE slug = ?
      `,
      [slug],
    );
    return true;
  } catch {
    return false;
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
  options: FilesystemRewardImageCacheOptions = {},
): Promise<CachedRewardImageFile | null> {
  const slug = toRewardImageCacheSlug(dinosaurName);
  const outputDirectory = resolveOutputDirectory(options);
  const cachedFiles: CachedRewardImageFile[] = [];

  for (const extension of SUPPORTED_IMAGE_EXTENSIONS) {
    const absolutePath = path.join(outputDirectory, `${slug}.${extension}`);

    try {
      await access(absolutePath);
      const fileStats = await stat(absolutePath);
      cachedFiles.push({
        absolutePath,
        extension,
        modifiedTimeMs: fileStats.mtimeMs,
      });
    } catch (error) {
      if (!isNotFoundError(error)) {
        throw error;
      }
    }
  }

  if (cachedFiles.length === 0) {
    return null;
  }

  cachedFiles.sort((leftFile, rightFile) => rightFile.modifiedTimeMs - leftFile.modifiedTimeMs);
  return cachedFiles[0];
}

export async function doesRewardImageExistOnDisk(
  dinosaurName: string,
  options: FilesystemRewardImageCacheOptions = {},
): Promise<boolean> {
  const cachedFile = await findCachedRewardImageFile(dinosaurName, options);
  return cachedFile !== null;
}

export async function readCachedRewardImage(
  dinosaurName: string,
  options: FilesystemRewardImageCacheOptions = {},
): Promise<GeneratedRewardImage | null> {
  const normalizedDinosaurName = normalizeDinosaurName(dinosaurName);
  const cachedFile = await findCachedRewardImageFile(normalizedDinosaurName, options);

  if (!cachedFile) {
    return null;
  }

  const imageBuffer = await readFile(cachedFile.absolutePath);
  const fallbackMimeType = getMimeTypeForExtension(cachedFile.extension);
  const metadataFromDatabase = await readRewardImageCacheMetadataFromDatabase(
    normalizedDinosaurName,
    cachedFile,
  );
  const metadata =
    metadataFromDatabase ??
    (await readRewardImageCacheMetadata(
      cachedFile.absolutePath,
      normalizedDinosaurName,
      fallbackMimeType,
    ));
  if (!metadataFromDatabase) {
    void upsertRewardImageCacheMetadataInDatabase({
      dinosaurName: metadata.dinosaurName,
      prompt: metadata.prompt,
      model: metadata.model,
      mimeType: metadata.mimeType,
      extension: cachedFile.extension,
      absoluteImagePath: cachedFile.absolutePath,
      updatedAtMs: cachedFile.modifiedTimeMs,
    }).catch(() => undefined);
  }

  return {
    dinosaurName: metadata.dinosaurName,
    prompt: metadata.prompt,
    model: metadata.model,
    mimeType: metadata.mimeType,
    imageBase64: imageBuffer.toString("base64"),
  };
}

export async function getRewardImageGenerationStatus(
  dinosaurName: string,
  options: FilesystemRewardImageCacheOptions = {},
): Promise<RewardImageGenerationStatusSnapshot> {
  const normalizedDinosaurName = normalizeDinosaurName(dinosaurName);
  const cachedFile = await findCachedRewardImageFile(normalizedDinosaurName, options);

  if (cachedFile) {
    const imagePath = toRewardImagePublicPath(
      normalizedDinosaurName,
      cachedFile.extension,
      cachedFile.modifiedTimeMs,
    );
    await safelyWriteRewardImageGenerationStatusToDatabase({
      dinosaurName: normalizedDinosaurName,
      status: "ready",
      imagePath,
      updatedAtMs: cachedFile.modifiedTimeMs,
    });

    return {
      dinosaurName: normalizedDinosaurName,
      status: "ready",
      imagePath,
    };
  }

  const inFlightGeneration = getInFlightRewardImageGeneration(normalizedDinosaurName, options);
  if (inFlightGeneration) {
    await safelyWriteRewardImageGenerationStatusToDatabase({
      dinosaurName: normalizedDinosaurName,
      status: "generating",
      imagePath: null,
      updatedAtMs: Date.now(),
    });

    return {
      dinosaurName: normalizedDinosaurName,
      status: "generating",
      imagePath: null,
    };
  }

  await safelyWriteRewardImageGenerationStatusToDatabase({
    dinosaurName: normalizedDinosaurName,
    status: "missing",
    imagePath: null,
    updatedAtMs: Date.now(),
  });

  return {
    dinosaurName: normalizedDinosaurName,
    status: "missing",
    imagePath: null,
  };
}

export async function persistRewardImageToFilesystemCache(
  image: GeneratedRewardImage,
  options: FilesystemRewardImageCacheOptions = {},
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

  const slug = toRewardImageCacheSlug(normalizedDinosaurName);
  for (const candidateExtension of SUPPORTED_IMAGE_EXTENSIONS) {
    if (candidateExtension === extension) {
      continue;
    }

    const siblingAbsolutePath = path.join(outputDirectory, `${slug}.${candidateExtension}`);
    const siblingMetadataPath = getCacheMetadataPath(siblingAbsolutePath);
    await rm(siblingAbsolutePath, { force: true }).catch(() => undefined);
    await rm(siblingMetadataPath, { force: true }).catch(() => undefined);
  }

  await writeFile(absoluteImagePath, imageBuffer);

  const metadata: RewardImageCacheMetadata = {
    dinosaurName: normalizedDinosaurName,
    prompt: getTrimmedNonEmptyString(image.prompt) ?? toFallbackCachedPrompt(normalizedDinosaurName),
    model: getTrimmedNonEmptyString(image.model) ?? DEFAULT_CACHE_MODEL,
    mimeType: getTrimmedNonEmptyString(image.mimeType) ?? getMimeTypeForExtension(extension),
  };
  await writeFile(metadataPath, JSON.stringify(metadata), "utf8");
  const persistedFileStats = await stat(absoluteImagePath);
  await upsertRewardImageCacheMetadataInDatabase({
    dinosaurName: metadata.dinosaurName,
    prompt: metadata.prompt,
    model: metadata.model,
    mimeType: metadata.mimeType,
    extension,
    absoluteImagePath,
    updatedAtMs: persistedFileStats.mtimeMs,
  });
  await safelyWriteRewardImageGenerationStatusToDatabase({
    dinosaurName: metadata.dinosaurName,
    status: "ready",
    imagePath: toRewardImagePublicPath(
      metadata.dinosaurName,
      extension,
      persistedFileStats.mtimeMs,
    ),
    updatedAtMs: persistedFileStats.mtimeMs,
  });

  return absoluteImagePath;
}

function startInFlightRewardImageGeneration(
  dinosaurName: string,
  generateImage: (request: RewardImageGenerationRequest) => Promise<GeneratedRewardImage>,
  options: FilesystemRewardImageCacheOptions,
): Promise<GeneratedRewardImage> {
  const inFlightGenerationKey = toInFlightRewardImageGenerationKey(dinosaurName, options);
  const generationPromise = (async () => {
    await safelyWriteRewardImageGenerationStatusToDatabase({
      dinosaurName,
      status: "generating",
      imagePath: null,
      updatedAtMs: Date.now(),
    });

    try {
      const generatedImage = await generateImage({ dinosaurName });
      await persistRewardImageToFilesystemCache(generatedImage, options);
      return generatedImage;
    } catch (error) {
      await safelyWriteRewardImageGenerationStatusToDatabase({
        dinosaurName,
        status: "missing",
        imagePath: null,
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
  options: FilesystemRewardImageCacheOptions,
): Promise<GeneratedRewardImage> | undefined {
  const inFlightGenerationKey = toInFlightRewardImageGenerationKey(dinosaurName, options);
  return inFlightRewardImageGenerations.get(inFlightGenerationKey);
}

export async function prefetchRewardImageWithFilesystemCache(
  request: RewardImageGenerationRequest,
  generateImage: (request: RewardImageGenerationRequest) => Promise<GeneratedRewardImage>,
  options: FilesystemRewardImageCacheOptions = {},
): Promise<RewardImagePrefetchStatus> {
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

export async function resolveRewardImageWithFilesystemCache(
  request: RewardImageGenerationRequest,
  generateImage: (request: RewardImageGenerationRequest) => Promise<GeneratedRewardImage>,
  options: FilesystemRewardImageCacheOptions = {},
): Promise<GeneratedRewardImage> {
  const normalizedDinosaurName = normalizeDinosaurName(request.dinosaurName);
  const cachedImage = await readCachedRewardImage(normalizedDinosaurName, options);

  if (cachedImage) {
    return cachedImage;
  }

  const inFlightGeneration = getInFlightRewardImageGeneration(normalizedDinosaurName, options);

  if (inFlightGeneration) {
    return inFlightGeneration;
  }

  return startInFlightRewardImageGeneration(normalizedDinosaurName, generateImage, options);
}

function toDatabaseRecordFromRow(
  row: RewardImageCacheDatabaseRecordRow,
): RewardImageCacheDatabaseRecord | null {
  const dinosaurName = getTrimmedNonEmptyString(row.dinosaur_name);
  if (!dinosaurName) {
    return null;
  }

  const mimeType = readMetadataString(row.mime_type, "image/png");
  const extension = toSupportedImageExtension(row.extension, mimeType);
  const updatedAtMs = toNonNegativeInteger(row.updated_at_ms) ?? 0;
  const status = normalizeGenerationStatus(row.generation_status) ?? "ready";
  const statusUpdatedAtMs = toNonNegativeInteger(row.generation_updated_at_ms) ?? updatedAtMs;
  const slug = getTrimmedNonEmptyString(row.slug) ?? toRewardImageCacheSlug(dinosaurName);
  const imagePath =
    status === "ready"
      ? getTrimmedNonEmptyString(row.generation_image_path) ??
        toRewardImagePublicPath(dinosaurName, extension, updatedAtMs)
      : null;

  return {
    slug,
    dinosaurName,
    prompt: readMetadataString(row.prompt, toFallbackCachedPrompt(dinosaurName)),
    model: readMetadataString(row.model, DEFAULT_CACHE_MODEL),
    mimeType,
    extension,
    absoluteImagePath:
      getTrimmedNonEmptyString(row.absolute_image_path) ??
      path.join(resolveOutputDirectory({}), `${slug}.${extension}`),
    imagePath,
    updatedAtMs,
    status,
    statusUpdatedAtMs,
  };
}

export async function listRewardImageCacheDatabaseRecords(): Promise<
  readonly RewardImageCacheDatabaseRecord[]
> {
  try {
    const database = await getRewardCacheDatabase();
    const rows = await allSqliteRows<RewardImageCacheDatabaseRecordRow>(
      database,
      `
        SELECT
          cache.slug,
          cache.dinosaur_name,
          cache.prompt,
          cache.model,
          cache.mime_type,
          cache.extension,
          cache.absolute_image_path,
          cache.updated_at_ms,
          status.status AS generation_status,
          status.image_path AS generation_image_path,
          status.updated_at_ms AS generation_updated_at_ms
        FROM reward_image_cache AS cache
        LEFT JOIN reward_image_generation_status AS status
          ON status.slug = cache.slug
        ORDER BY cache.updated_at_ms DESC, cache.dinosaur_name COLLATE NOCASE ASC
      `,
    );

    const records: RewardImageCacheDatabaseRecord[] = [];
    for (const row of rows) {
      const record = toDatabaseRecordFromRow(row);
      if (record) {
        records.push(record);
      }
    }

    return records;
  } catch {
    return [];
  }
}

export async function getRewardImageCacheDatabaseRecord(
  dinosaurName: string,
): Promise<RewardImageCacheDatabaseRecord | null> {
  const normalizedDinosaurName = normalizeDinosaurName(dinosaurName);

  try {
    const database = await getRewardCacheDatabase();
    const row = await getSqliteRow<RewardImageCacheDatabaseRecordRow>(
      database,
      `
        SELECT
          cache.slug,
          cache.dinosaur_name,
          cache.prompt,
          cache.model,
          cache.mime_type,
          cache.extension,
          cache.absolute_image_path,
          cache.updated_at_ms,
          status.status AS generation_status,
          status.image_path AS generation_image_path,
          status.updated_at_ms AS generation_updated_at_ms
        FROM reward_image_cache AS cache
        LEFT JOIN reward_image_generation_status AS status
          ON status.slug = cache.slug
        WHERE cache.slug = ?
        LIMIT 1
      `,
      [toRewardImageCacheSlug(normalizedDinosaurName)],
    );

    return row ? toDatabaseRecordFromRow(row) : null;
  } catch {
    return null;
  }
}

export async function deleteRewardImageCacheEntry(
  dinosaurName: string,
  options: FilesystemRewardImageCacheOptions = {},
): Promise<DeleteRewardImageCacheEntryResult> {
  const normalizedDinosaurName = normalizeDinosaurName(dinosaurName);
  const outputDirectory = resolveOutputDirectory(options);
  const slug = toRewardImageCacheSlug(normalizedDinosaurName);

  for (const extension of SUPPORTED_IMAGE_EXTENSIONS) {
    const absoluteImagePath = path.join(outputDirectory, `${slug}.${extension}`);
    const metadataPath = getCacheMetadataPath(absoluteImagePath);

    await rm(absoluteImagePath, { force: true }).catch((error) => {
      if (!isNotFoundError(error)) {
        throw error;
      }
    });
    await rm(metadataPath, { force: true }).catch((error) => {
      if (!isNotFoundError(error)) {
        throw error;
      }
    });
  }

  const deletedDatabaseRecord = await removeRewardImageCacheDatabaseEntries(normalizedDinosaurName);
  await safelyWriteRewardImageGenerationStatusToDatabase({
    dinosaurName: normalizedDinosaurName,
    status: "missing",
    imagePath: null,
    updatedAtMs: Date.now(),
  });

  return {
    dinosaurName: normalizedDinosaurName,
    deletedDatabaseRecord,
  };
}
