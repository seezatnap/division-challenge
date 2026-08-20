/**
 * The login session cookie: how API routes read it from a request, turn it
 * into the authenticated player, and write/clear it on responses.
 *
 * Server-only.
 */

import { NextResponse } from "next/server";

import {
  PlayerAuthError,
  readPlayerSession,
  type AuthenticatedPlayer,
  type PlayerSessionRecord,
} from "./sqlite-player-auth";
import { toPlayerNameKey } from "./sqlite-player-profiles";

export const PLAYER_SESSION_COOKIE_NAME = "ingen_operator_session";

export function parseCookieHeader(header: string | null | undefined): Map<string, string> {
  const cookies = new Map<string, string>();
  if (!header) {
    return cookies;
  }

  for (const part of header.split(";")) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const name = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();
    if (!name || cookies.has(name)) {
      continue;
    }

    try {
      cookies.set(name, decodeURIComponent(rawValue));
    } catch {
      cookies.set(name, rawValue);
    }
  }

  return cookies;
}

export function readPlayerSessionTokenFromRequest(request: Request): string | null {
  const token = parseCookieHeader(request.headers.get("cookie")).get(PLAYER_SESSION_COOKIE_NAME);
  return token && token.length > 0 ? token : null;
}

/**
 * `Secure` must be omitted on plain-http development origins or the browser
 * drops the cookie. Honour the proxy's forwarded protocol in production.
 */
export function isSecureRequest(request: Request): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    return forwardedProto.split(",")[0]?.trim().toLowerCase() === "https";
  }

  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export function buildPlayerSessionCookie(input: {
  token: string;
  expiresAtMs: number;
  secure: boolean;
  nowMs?: number;
}): string {
  const nowMs = input.nowMs ?? Date.now();
  const maxAgeSeconds = Math.max(0, Math.floor((input.expiresAtMs - nowMs) / 1000));
  const attributes = [
    `${PLAYER_SESSION_COOKIE_NAME}=${encodeURIComponent(input.token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
    `Expires=${new Date(input.expiresAtMs).toUTCString()}`,
  ];
  if (input.secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function buildExpiredPlayerSessionCookie(input: { secure: boolean }): string {
  const attributes = [
    `${PLAYER_SESSION_COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT",
  ];
  if (input.secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export interface RequestPlayerSession extends PlayerSessionRecord {
  token: string;
}

/** The session behind the request's cookie, or `null` when absent/invalid. */
export async function resolvePlayerSessionFromRequest(
  request: Request,
): Promise<RequestPlayerSession | null> {
  const token = readPlayerSessionTokenFromRequest(request);
  if (!token) {
    return null;
  }

  const session = await readPlayerSession(token);
  return session ? { ...session, token } : null;
}

/** Like `resolvePlayerSessionFromRequest` but rejects unauthenticated requests. */
export async function requirePlayerSession(request: Request): Promise<RequestPlayerSession> {
  const session = await resolvePlayerSessionFromRequest(request);
  if (!session) {
    throw new PlayerAuthError("unauthenticated", "Log in to continue.");
  }

  return session;
}

/**
 * Ensures the logged-in session belongs to `playerName` (case-insensitive,
 * whitespace-normalised). Returns the session for convenience.
 */
export async function requirePlayerSessionFor(
  request: Request,
  playerName: string,
): Promise<RequestPlayerSession> {
  const session = await requirePlayerSession(request);
  if (session.playerNameKey !== toPlayerNameKey(playerName)) {
    throw new PlayerAuthError("forbidden", "You are not logged in as that operator.");
  }

  return session;
}

export function toAuthenticatedPlayerPayload(player: AuthenticatedPlayer): {
  playerName: string;
} {
  return { playerName: player.playerName };
}

export function toPlayerAuthErrorResponse(error: unknown, fallbackMessage: string): Response {
  if (error instanceof PlayerAuthError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.message } },
      { status: error.status },
    );
  }

  const message = error instanceof Error ? error.message : fallbackMessage;
  return NextResponse.json({ error: { message } }, { status: 400 });
}
