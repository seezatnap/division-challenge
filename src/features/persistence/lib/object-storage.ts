/**
 * Object storage for reward image binaries. Production uses Cloudflare R2
 * through the S3-compatible API (`R2_*` environment variables). When R2 is not
 * configured the app falls back to a local directory so `npm run dev` keeps
 * working without credentials, and tests use an in-memory adapter.
 *
 * Adapters share one small interface so the reward image cache never has to
 * know which backend it is talking to.
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { resolveGitProjectRootDirectory, type RuntimeEnvironment } from "./database";

export const R2_ACCOUNT_ID_ENV_VAR = "R2_ACCOUNT_ID";
export const R2_ACCESS_KEY_ID_ENV_VAR = "R2_ACCESS_KEY_ID";
export const R2_SECRET_ACCESS_KEY_ENV_VAR = "R2_SECRET_ACCESS_KEY";
export const R2_BUCKET_ENV_VAR = "R2_BUCKET";
export const R2_ENDPOINT_ENV_VAR = "R2_ENDPOINT";
export const R2_PUBLIC_BASE_URL_ENV_VAR = "R2_PUBLIC_BASE_URL";
export const R2_KEY_PREFIX_ENV_VAR = "R2_KEY_PREFIX";
export const REWARD_IMAGE_STORAGE_DIRECTORY_ENV_VAR = "REWARD_IMAGE_STORAGE_DIRECTORY";

export const DEFAULT_REWARD_IMAGE_KEY_PREFIX = "rewards";
const DEFAULT_LOCAL_STORAGE_DIRECTORY_NAME = ".reward-images";
const IMMUTABLE_OBJECT_CACHE_CONTROL = "public, max-age=31536000, immutable";

export type RewardImageStorageKind = "r2" | "filesystem" | "memory";

export interface StoredObject {
  body: Uint8Array;
  contentType: string | null;
}

export interface PutObjectInput {
  key: string;
  body: Uint8Array;
  contentType: string;
}

export interface RewardImageStorage {
  /** Stable identity used to scope in-flight generation tracking. */
  readonly id: string;
  readonly kind: RewardImageStorageKind;
  /** Prefix for every object key written by the reward cache (no slashes at the ends). */
  readonly keyPrefix: string;
  /** Base URL objects can be fetched from directly by browsers, if any. */
  readonly publicBaseUrl: string | null;
  putObject(input: PutObjectInput): Promise<void>;
  getObject(key: string): Promise<StoredObject | null>;
  deleteObject(key: string): Promise<void>;
  /** Absolute public URL for a key, or null when objects are only reachable via the app. */
  toPublicUrl(key: string): string | null;
}

export interface R2StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  endpoint: string;
  publicBaseUrl: string | null;
  keyPrefix: string;
}

export interface RewardImageStorageLocationSnapshot {
  kind: RewardImageStorageKind;
  bucket: string | null;
  endpoint: string | null;
  publicBaseUrl: string | null;
  keyPrefix: string;
  directory: string | null;
}

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function normalizeKeyPrefix(value: string | null): string {
  const trimmed = (value ?? DEFAULT_REWARD_IMAGE_KEY_PREFIX).replace(/^\/+|\/+$/g, "");
  return trimmed.length > 0 ? trimmed : DEFAULT_REWARD_IMAGE_KEY_PREFIX;
}

function normalizeBaseUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/g, "");
}

function joinPublicUrl(baseUrl: string, key: string): string {
  const encodedKey = key
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${baseUrl}/${encodedKey}`;
}

function assertSafeObjectKey(key: string): string {
  const normalizedKey = getTrimmedNonEmptyString(key);
  if (!normalizedKey || normalizedKey.startsWith("/") || normalizedKey.includes("..")) {
    throw new Error(`Invalid object storage key: ${JSON.stringify(key)}`);
  }

  return normalizedKey;
}

export function isR2Configured(env: RuntimeEnvironment = process.env): boolean {
  return Boolean(
    getTrimmedNonEmptyString(env[R2_ACCOUNT_ID_ENV_VAR]) &&
      getTrimmedNonEmptyString(env[R2_ACCESS_KEY_ID_ENV_VAR]) &&
      getTrimmedNonEmptyString(env[R2_SECRET_ACCESS_KEY_ENV_VAR]) &&
      getTrimmedNonEmptyString(env[R2_BUCKET_ENV_VAR]),
  );
}

export function resolveR2StorageConfig(env: RuntimeEnvironment = process.env): R2StorageConfig {
  const accountId = getTrimmedNonEmptyString(env[R2_ACCOUNT_ID_ENV_VAR]);
  const accessKeyId = getTrimmedNonEmptyString(env[R2_ACCESS_KEY_ID_ENV_VAR]);
  const secretAccessKey = getTrimmedNonEmptyString(env[R2_SECRET_ACCESS_KEY_ENV_VAR]);
  const bucket = getTrimmedNonEmptyString(env[R2_BUCKET_ENV_VAR]);

  const missing = [
    accountId ? null : R2_ACCOUNT_ID_ENV_VAR,
    accessKeyId ? null : R2_ACCESS_KEY_ID_ENV_VAR,
    secretAccessKey ? null : R2_SECRET_ACCESS_KEY_ENV_VAR,
    bucket ? null : R2_BUCKET_ENV_VAR,
  ].filter((name): name is string => name !== null);

  if (missing.length > 0 || !accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(`Cloudflare R2 is not configured. Missing: ${missing.join(", ")}.`);
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint:
      normalizeBaseUrl(getTrimmedNonEmptyString(env[R2_ENDPOINT_ENV_VAR])) ??
      `https://${accountId}.r2.cloudflarestorage.com`,
    publicBaseUrl: normalizeBaseUrl(getTrimmedNonEmptyString(env[R2_PUBLIC_BASE_URL_ENV_VAR])),
    keyPrefix: normalizeKeyPrefix(getTrimmedNonEmptyString(env[R2_KEY_PREFIX_ENV_VAR])),
  };
}

function isNotFoundStorageError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const candidate = error as { name?: unknown; Code?: unknown; $metadata?: { httpStatusCode?: unknown } };
  return (
    candidate.name === "NoSuchKey" ||
    candidate.name === "NotFound" ||
    candidate.Code === "NoSuchKey" ||
    candidate.$metadata?.httpStatusCode === 404
  );
}

export interface R2StorageClient {
  send: S3Client["send"];
}

export function createR2RewardImageStorage(
  config: R2StorageConfig,
  options: { client?: R2StorageClient } = {},
): RewardImageStorage {
  const client: R2StorageClient =
    options.client ??
    new S3Client({
      region: "auto",
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // R2 does not accept the newer CRC-based default checksums the AWS SDK
      // sends unprompted; only compute/validate them when an operation demands it.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });

  return {
    id: `r2:${config.bucket}`,
    kind: "r2",
    keyPrefix: config.keyPrefix,
    publicBaseUrl: config.publicBaseUrl,
    async putObject(input) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: assertSafeObjectKey(input.key),
          Body: input.body,
          ContentType: input.contentType,
          CacheControl: IMMUTABLE_OBJECT_CACHE_CONTROL,
        }),
      );
    },
    async getObject(key) {
      try {
        const response = await client.send(
          new GetObjectCommand({ Bucket: config.bucket, Key: assertSafeObjectKey(key) }),
        );
        if (!response.Body) {
          return null;
        }

        return {
          body: await response.Body.transformToByteArray(),
          contentType: getTrimmedNonEmptyString(response.ContentType),
        };
      } catch (error) {
        if (isNotFoundStorageError(error)) {
          return null;
        }

        throw error;
      }
    },
    async deleteObject(key) {
      try {
        await client.send(
          new DeleteObjectCommand({ Bucket: config.bucket, Key: assertSafeObjectKey(key) }),
        );
      } catch (error) {
        if (!isNotFoundStorageError(error)) {
          throw error;
        }
      }
    },
    toPublicUrl(key) {
      return config.publicBaseUrl ? joinPublicUrl(config.publicBaseUrl, key) : null;
    },
  };
}

export function resolveLocalRewardImageStorageDirectory(
  env: RuntimeEnvironment = process.env,
): string {
  const configuredDirectory = getTrimmedNonEmptyString(env[REWARD_IMAGE_STORAGE_DIRECTORY_ENV_VAR]);
  if (configuredDirectory) {
    return path.resolve(configuredDirectory);
  }

  return path.join(resolveGitProjectRootDirectory(), DEFAULT_LOCAL_STORAGE_DIRECTORY_NAME);
}

/** Local-disk adapter used when R2 credentials are absent (development only). */
export function createFilesystemRewardImageStorage(
  directory: string,
  options: { keyPrefix?: string } = {},
): RewardImageStorage {
  const rootDirectory = path.resolve(directory);

  function toAbsolutePath(key: string): string {
    const absolutePath = path.resolve(rootDirectory, assertSafeObjectKey(key));
    if (!absolutePath.startsWith(`${rootDirectory}${path.sep}`)) {
      throw new Error(`Object storage key escapes the storage directory: ${JSON.stringify(key)}`);
    }

    return absolutePath;
  }

  return {
    id: `filesystem:${rootDirectory}`,
    kind: "filesystem",
    keyPrefix: normalizeKeyPrefix(options.keyPrefix ?? null),
    publicBaseUrl: null,
    async putObject(input) {
      const absolutePath = toAbsolutePath(input.key);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, input.body);
    },
    async getObject(key) {
      try {
        const body = await readFile(toAbsolutePath(key));
        return { body: new Uint8Array(body), contentType: null };
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code === "ENOENT") {
          return null;
        }

        throw error;
      }
    },
    async deleteObject(key) {
      await rm(toAbsolutePath(key), { force: true });
    },
    toPublicUrl() {
      return null;
    },
  };
}

let memoryStorageCounter = 0;

/** In-memory adapter for tests. */
export function createInMemoryRewardImageStorage(
  options: { keyPrefix?: string; publicBaseUrl?: string | null } = {},
): RewardImageStorage & { readonly objects: Map<string, StoredObject> } {
  const objects = new Map<string, StoredObject>();
  const publicBaseUrl = normalizeBaseUrl(options.publicBaseUrl ?? null);
  memoryStorageCounter += 1;

  return {
    id: `memory:${memoryStorageCounter}`,
    kind: "memory",
    keyPrefix: normalizeKeyPrefix(options.keyPrefix ?? null),
    publicBaseUrl,
    objects,
    async putObject(input) {
      objects.set(assertSafeObjectKey(input.key), {
        body: new Uint8Array(input.body),
        contentType: input.contentType,
      });
    },
    async getObject(key) {
      return objects.get(assertSafeObjectKey(key)) ?? null;
    },
    async deleteObject(key) {
      objects.delete(assertSafeObjectKey(key));
    },
    toPublicUrl(key) {
      return publicBaseUrl ? joinPublicUrl(publicBaseUrl, key) : null;
    },
  };
}

let defaultStorage: RewardImageStorage | null = null;
let didWarnAboutFilesystemFallback = false;

/**
 * Resolves the storage backend from the environment: R2 when configured,
 * otherwise the local `.reward-images/` directory (with a one-time warning).
 */
export function getDefaultRewardImageStorage(env: RuntimeEnvironment = process.env): RewardImageStorage {
  if (defaultStorage) {
    return defaultStorage;
  }

  if (isR2Configured(env)) {
    defaultStorage = createR2RewardImageStorage(resolveR2StorageConfig(env));
    return defaultStorage;
  }

  const directory = resolveLocalRewardImageStorageDirectory(env);
  if (!didWarnAboutFilesystemFallback) {
    didWarnAboutFilesystemFallback = true;
    console.warn(
      `[rewards] Cloudflare R2 is not configured (set ${R2_ACCOUNT_ID_ENV_VAR}, ${R2_ACCESS_KEY_ID_ENV_VAR}, ${R2_SECRET_ACCESS_KEY_ENV_VAR}, ${R2_BUCKET_ENV_VAR}); storing reward images locally under ${directory}.`,
    );
  }

  defaultStorage = createFilesystemRewardImageStorage(directory, {
    keyPrefix: getTrimmedNonEmptyString(env[R2_KEY_PREFIX_ENV_VAR]) ?? undefined,
  });
  return defaultStorage;
}

export function getRewardImageStorageLocation(
  storage: RewardImageStorage = getDefaultRewardImageStorage(),
  env: RuntimeEnvironment = process.env,
): RewardImageStorageLocationSnapshot {
  if (storage.kind === "r2") {
    const config = resolveR2StorageConfig(env);
    return {
      kind: "r2",
      bucket: config.bucket,
      endpoint: config.endpoint,
      publicBaseUrl: config.publicBaseUrl,
      keyPrefix: storage.keyPrefix,
      directory: null,
    };
  }

  return {
    kind: storage.kind,
    bucket: null,
    endpoint: null,
    publicBaseUrl: storage.publicBaseUrl,
    keyPrefix: storage.keyPrefix,
    directory: storage.kind === "filesystem" ? storage.id.replace(/^filesystem:/, "") : null,
  };
}
