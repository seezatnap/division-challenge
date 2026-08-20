/**
 * Password hashing for operator (player) credentials. Uses Node's built-in
 * scrypt so no extra dependency is needed; every hash carries its own random
 * salt and parameters (`scrypt$N$r$p$salt$hash`, base64url) so the cost can be
 * raised later without invalidating stored hashes.
 *
 * Server-only: imports `node:crypto`.
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export {
  MAX_PLAYER_PASSWORD_LENGTH,
  MIN_PLAYER_PASSWORD_LENGTH,
  assertPasswordMeetsPolicy,
  describePasswordPolicyViolation,
} from "./password-policy";

export const PASSWORD_HASH_ALGORITHM = "scrypt";

/**
 * Password assigned to every profile that existed before passwords were
 * introduced (see the `player_credentials` backfill in `./database`).
 */
export const DEFAULT_LEGACY_PLAYER_PASSWORD = "password";

const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;
const SCRYPT_KEY_LENGTH = 64;
const SALT_BYTE_LENGTH = 16;

function runScrypt(
  password: string,
  salt: Buffer,
  params: { N: number; r: number; p: number },
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      keyLength,
      { N: params.N, r: params.r, p: params.p, maxmem: 256 * params.N * params.r },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey);
      },
    );
  });
}

function toPositiveInteger(value: string): number | null {
  if (!/^\d+$/.test(value)) {
    return null;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export async function hashPassword(password: string): Promise<string> {
  if (typeof password !== "string" || password.length === 0) {
    throw new Error("Password is required.");
  }

  const salt = randomBytes(SALT_BYTE_LENGTH);
  const derivedKey = await runScrypt(
    password,
    salt,
    { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
    SCRYPT_KEY_LENGTH,
  );

  return [
    PASSWORD_HASH_ALGORITHM,
    String(SCRYPT_COST),
    String(SCRYPT_BLOCK_SIZE),
    String(SCRYPT_PARALLELIZATION),
    salt.toString("base64url"),
    derivedKey.toString("base64url"),
  ].join("$");
}

export function isPasswordHash(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }

  const parts = value.split("$");
  if (parts.length !== 6 || parts[0] !== PASSWORD_HASH_ALGORITHM) {
    return false;
  }

  return (
    toPositiveInteger(parts[1]) !== null &&
    toPositiveInteger(parts[2]) !== null &&
    toPositiveInteger(parts[3]) !== null &&
    parts[4].length > 0 &&
    parts[5].length > 0
  );
}

/**
 * Constant-time comparison of `password` against a stored hash. Malformed
 * hashes never verify.
 */
export async function verifyPassword(password: unknown, storedHash: unknown): Promise<boolean> {
  if (typeof password !== "string" || password.length === 0 || !isPasswordHash(storedHash)) {
    return false;
  }

  const [, costText, blockSizeText, parallelizationText, saltText, hashText] =
    storedHash.split("$");
  const params = {
    N: toPositiveInteger(costText) as number,
    r: toPositiveInteger(blockSizeText) as number,
    p: toPositiveInteger(parallelizationText) as number,
  };

  let salt: Buffer;
  let expectedKey: Buffer;
  try {
    salt = Buffer.from(saltText, "base64url");
    expectedKey = Buffer.from(hashText, "base64url");
  } catch {
    return false;
  }

  if (salt.length === 0 || expectedKey.length === 0) {
    return false;
  }

  try {
    const derivedKey = await runScrypt(password, salt, params, expectedKey.length);
    return derivedKey.length === expectedKey.length && timingSafeEqual(derivedKey, expectedKey);
  } catch {
    return false;
  }
}

/** Constant-time equality for two plain strings (used for the legacy default). */
export function secureStringEquals(left: unknown, right: unknown): boolean {
  if (typeof left !== "string" || typeof right !== "string") {
    return false;
  }

  const leftBuffer = Buffer.from(left.normalize("NFKC"), "utf8");
  const rightBuffer = Buffer.from(right.normalize("NFKC"), "utf8");
  if (leftBuffer.length !== rightBuffer.length) {
    // Still burn a comparison so the early return is not a length oracle.
    timingSafeEqual(leftBuffer, leftBuffer);
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}
