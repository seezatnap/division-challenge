/**
 * Operator (player) credentials and login sessions in the shared database.
 *
 * - `player_credentials`: one scrypt hash per player (see ./password-hashing).
 * - `player_sessions`: sha256 of the opaque cookie token → player, with expiry.
 *
 * Profiles that predate passwords are backfilled with the documented default
 * password by the schema migration; `authenticatePlayer` also accepts that
 * default for any profile that still has no credentials row (for example one
 * copied in by the legacy migration script after the backfill ran) and
 * provisions a hash for it on first login.
 *
 * Server-only.
 */

import { createHash, randomBytes } from "node:crypto";

import { executeDatabaseStatement, type DatabaseRow } from "./database";
import { normalizePlayerProfileName } from "./local-player-profiles";
import {
  DEFAULT_LEGACY_PLAYER_PASSWORD,
  assertPasswordMeetsPolicy,
  hashPassword,
  secureStringEquals,
  verifyPassword,
} from "./password-hashing";
import {
  readPlayerProfileSnapshotFromSqlite,
  toPlayerNameKey,
} from "./sqlite-player-profiles";

export const PLAYER_SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const SESSION_TOKEN_BYTE_LENGTH = 32;

export type PlayerAuthErrorCode =
  | "invalid-request"
  | "unknown-operator"
  | "invalid-password"
  | "operator-exists"
  | "unauthenticated"
  | "forbidden";

const PLAYER_AUTH_ERROR_STATUS: Record<PlayerAuthErrorCode, number> = {
  "invalid-request": 400,
  "unknown-operator": 404,
  "invalid-password": 401,
  "operator-exists": 409,
  unauthenticated: 401,
  forbidden: 403,
};

export class PlayerAuthError extends Error {
  readonly code: PlayerAuthErrorCode;
  readonly status: number;

  constructor(code: PlayerAuthErrorCode, message: string) {
    super(message);
    this.name = "PlayerAuthError";
    this.code = code;
    this.status = PLAYER_AUTH_ERROR_STATUS[code];
  }
}

export function isPlayerAuthError(error: unknown): error is PlayerAuthError {
  return error instanceof PlayerAuthError;
}

export interface PlayerCredentialsRecord {
  playerNameKey: string;
  playerName: string;
  passwordHash: string;
  createdAtMs: number;
  updatedAtMs: number;
}

export interface AuthenticatedPlayer {
  playerName: string;
  playerNameKey: string;
}

export interface PlayerSessionRecord extends AuthenticatedPlayer {
  expiresAtMs: number;
}

export interface IssuedPlayerSession extends PlayerSessionRecord {
  /** Opaque token to hand to the browser (never stored). */
  token: string;
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

function normalizePlayerNameOrThrow(playerName: unknown): string {
  try {
    return normalizePlayerProfileName(typeof playerName === "string" ? playerName : "");
  } catch (error) {
    throw new PlayerAuthError(
      "invalid-request",
      error instanceof Error ? error.message : "Player name is required.",
    );
  }
}

function requirePasswordString(password: unknown, label = "Password"): string {
  if (typeof password !== "string" || password.length === 0) {
    throw new PlayerAuthError("invalid-request", `${label} is required.`);
  }

  return password;
}

function assertNewPasswordMeetsPolicy(password: unknown): asserts password is string {
  try {
    assertPasswordMeetsPolicy(password);
  } catch (error) {
    throw new PlayerAuthError(
      "invalid-request",
      error instanceof Error ? error.message : "Password does not meet the policy.",
    );
  }
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function toPlayerCredentialsRecord(row: DatabaseRow): PlayerCredentialsRecord | null {
  const playerNameKey = getTrimmedNonEmptyString(row.player_name_key);
  const playerName = getTrimmedNonEmptyString(row.player_name);
  const passwordHash = getTrimmedNonEmptyString(row.password_hash);
  const createdAtMs = toNonNegativeInteger(row.created_at_ms);
  const updatedAtMs = toNonNegativeInteger(row.updated_at_ms);

  if (!playerNameKey || !playerName || !passwordHash || createdAtMs === null || updatedAtMs === null) {
    return null;
  }

  return { playerNameKey, playerName, passwordHash, createdAtMs, updatedAtMs };
}

export async function readPlayerCredentials(
  playerName: string,
): Promise<PlayerCredentialsRecord | null> {
  const result = await executeDatabaseStatement({
    sql: `
      SELECT player_name_key, player_name, password_hash, created_at_ms, updated_at_ms
      FROM player_credentials
      WHERE player_name_key = ?
      LIMIT 1
    `,
    args: [toPlayerNameKey(playerName)],
  });

  const row = result.rows[0];
  return row ? toPlayerCredentialsRecord(row) : null;
}

async function insertPlayerCredentials(input: {
  playerName: string;
  password: string;
}): Promise<PlayerCredentialsRecord> {
  const playerName = normalizePlayerProfileName(input.playerName);
  const playerNameKey = toPlayerNameKey(playerName);
  const nowMs = Date.now();

  await executeDatabaseStatement({
    sql: `
      INSERT INTO player_credentials (
        player_name_key,
        player_name,
        password_hash,
        created_at_ms,
        updated_at_ms
      )
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(player_name_key) DO NOTHING
    `,
    args: [playerNameKey, playerName, await hashPassword(input.password), nowMs, nowMs],
  });

  const persisted = await readPlayerCredentials(playerName);
  if (!persisted) {
    throw new Error("Player credentials write did not persist.");
  }

  return persisted;
}

/**
 * Creates credentials for a brand-new operator. Names that already have
 * credentials — or an existing profile, which is owned by whoever knows the
 * legacy default password — cannot be claimed.
 */
export async function registerPlayer(input: {
  playerName: unknown;
  password: unknown;
}): Promise<AuthenticatedPlayer> {
  const playerName = normalizePlayerNameOrThrow(input.playerName);
  assertNewPasswordMeetsPolicy(input.password);

  const [existingCredentials, existingProfile] = await Promise.all([
    readPlayerCredentials(playerName),
    readPlayerProfileSnapshotFromSqlite<unknown>(playerName),
  ]);
  if (existingCredentials || existingProfile) {
    throw new PlayerAuthError(
      "operator-exists",
      "An operator with that ID already exists. Log in with its password instead.",
    );
  }

  const credentials = await insertPlayerCredentials({ playerName, password: input.password });
  if (!(await verifyPassword(input.password, credentials.passwordHash))) {
    // Lost a race with a concurrent registration for the same name.
    throw new PlayerAuthError(
      "operator-exists",
      "An operator with that ID already exists. Log in with its password instead.",
    );
  }

  return { playerName: credentials.playerName, playerNameKey: credentials.playerNameKey };
}

/**
 * Verifies `password` for `playerName`. Resolves with the canonical player
 * name on success; rejects with a `PlayerAuthError` otherwise.
 */
export async function authenticatePlayer(input: {
  playerName: unknown;
  password: unknown;
}): Promise<AuthenticatedPlayer> {
  const playerName = normalizePlayerNameOrThrow(input.playerName);
  const password = requirePasswordString(input.password);

  const credentials = await readPlayerCredentials(playerName);
  if (credentials) {
    if (!(await verifyPassword(password, credentials.passwordHash))) {
      throw new PlayerAuthError("invalid-password", "Incorrect password for that operator ID.");
    }

    return { playerName: credentials.playerName, playerNameKey: credentials.playerNameKey };
  }

  const legacyProfile = await readPlayerProfileSnapshotFromSqlite<unknown>(playerName);
  if (!legacyProfile) {
    throw new PlayerAuthError("unknown-operator", "No operator found with that ID.");
  }

  if (!secureStringEquals(password, DEFAULT_LEGACY_PLAYER_PASSWORD)) {
    throw new PlayerAuthError("invalid-password", "Incorrect password for that operator ID.");
  }

  const provisioned = await insertPlayerCredentials({
    playerName: legacyProfile.playerName,
    password,
  });
  return { playerName: provisioned.playerName, playerNameKey: provisioned.playerNameKey };
}

/**
 * Replaces the password after confirming the current one. Other sessions for
 * the player are revoked; pass `keepSessionToken` to keep the caller's.
 */
export async function changePlayerPassword(input: {
  playerName: unknown;
  currentPassword: unknown;
  newPassword: unknown;
  keepSessionToken?: string | null;
}): Promise<AuthenticatedPlayer> {
  const currentPassword = requirePasswordString(input.currentPassword, "Current password");
  assertNewPasswordMeetsPolicy(input.newPassword);

  // Re-uses the login path so a legacy profile can change away from the
  // default password on its very first session.
  const player = await authenticatePlayer({
    playerName: input.playerName,
    password: currentPassword,
  });

  await executeDatabaseStatement({
    sql: `
      UPDATE player_credentials
      SET password_hash = ?, updated_at_ms = ?
      WHERE player_name_key = ?
    `,
    args: [await hashPassword(input.newPassword), Date.now(), player.playerNameKey],
  });

  await deletePlayerSessions(player.playerNameKey, input.keepSessionToken ?? null);

  return player;
}

export async function createPlayerSession(
  player: AuthenticatedPlayer,
  options: { nowMs?: number; ttlMs?: number } = {},
): Promise<IssuedPlayerSession> {
  const nowMs = toNonNegativeInteger(options.nowMs) ?? Date.now();
  const ttlMs = toNonNegativeInteger(options.ttlMs) ?? PLAYER_SESSION_TTL_MS;
  const expiresAtMs = nowMs + ttlMs;
  const token = randomBytes(SESSION_TOKEN_BYTE_LENGTH).toString("base64url");

  await executeDatabaseStatement({
    sql: `
      INSERT INTO player_sessions (token_hash, player_name_key, created_at_ms, expires_at_ms)
      VALUES (?, ?, ?, ?)
    `,
    args: [hashSessionToken(token), player.playerNameKey, nowMs, expiresAtMs],
  });

  return {
    token,
    playerName: player.playerName,
    playerNameKey: player.playerNameKey,
    expiresAtMs,
  };
}

/** Resolves a cookie token to its player, or `null` when unknown/expired. */
export async function readPlayerSession(
  token: unknown,
  options: { nowMs?: number } = {},
): Promise<PlayerSessionRecord | null> {
  const normalizedToken = getTrimmedNonEmptyString(token);
  if (!normalizedToken) {
    return null;
  }

  const nowMs = toNonNegativeInteger(options.nowMs) ?? Date.now();
  const result = await executeDatabaseStatement({
    sql: `
      SELECT s.player_name_key, s.expires_at_ms, c.player_name
      FROM player_sessions AS s
      JOIN player_credentials AS c ON c.player_name_key = s.player_name_key
      WHERE s.token_hash = ?
      LIMIT 1
    `,
    args: [hashSessionToken(normalizedToken)],
  });

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  const playerNameKey = getTrimmedNonEmptyString(row.player_name_key);
  const playerName = getTrimmedNonEmptyString(row.player_name);
  const expiresAtMs = toNonNegativeInteger(row.expires_at_ms);
  if (!playerNameKey || !playerName || expiresAtMs === null) {
    return null;
  }

  if (expiresAtMs <= nowMs) {
    await deletePlayerSession(normalizedToken);
    return null;
  }

  return { playerName, playerNameKey, expiresAtMs };
}

export async function deletePlayerSession(token: unknown): Promise<void> {
  const normalizedToken = getTrimmedNonEmptyString(token);
  if (!normalizedToken) {
    return;
  }

  await executeDatabaseStatement({
    sql: "DELETE FROM player_sessions WHERE token_hash = ?",
    args: [hashSessionToken(normalizedToken)],
  });
}

/** Revokes every session for a player, optionally sparing one token. */
export async function deletePlayerSessions(
  playerNameKey: string,
  keepToken: string | null = null,
): Promise<void> {
  if (keepToken) {
    await executeDatabaseStatement({
      sql: "DELETE FROM player_sessions WHERE player_name_key = ? AND token_hash != ?",
      args: [playerNameKey, hashSessionToken(keepToken)],
    });
    return;
  }

  await executeDatabaseStatement({
    sql: "DELETE FROM player_sessions WHERE player_name_key = ?",
    args: [playerNameKey],
  });
}

/** Housekeeping: drops sessions whose expiry has passed. */
export async function deleteExpiredPlayerSessions(nowMs: number = Date.now()): Promise<void> {
  await executeDatabaseStatement({
    sql: "DELETE FROM player_sessions WHERE expires_at_ms <= ?",
    args: [nowMs],
  });
}
