/**
 * Browser-side client for the operator login endpoints under `/api/auth`.
 * Safe to import from client components (no Node-only imports).
 */

export const DEFAULT_PLAYER_AUTH_API_BASE = "/api/auth";

export type PlayerAuthApiErrorCode =
  | "invalid-request"
  | "unknown-operator"
  | "invalid-password"
  | "operator-exists"
  | "unauthenticated"
  | "forbidden"
  | "unknown";

export class PlayerAuthApiError extends Error {
  readonly code: PlayerAuthApiErrorCode;
  readonly status: number;

  constructor(code: PlayerAuthApiErrorCode, message: string, status: number) {
    super(message);
    this.name = "PlayerAuthApiError";
    this.code = code;
    this.status = status;
  }
}

export function isPlayerAuthApiError(error: unknown): error is PlayerAuthApiError {
  return error instanceof PlayerAuthApiError;
}

export interface AuthenticatedPlayerSummary {
  playerName: string;
}

interface PlayerAuthApiEnvelope {
  data?: {
    player?: AuthenticatedPlayerSummary | null;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

interface PlayerAuthRequestOptions {
  apiBase?: string;
  fetchFn?: typeof fetch;
}

export interface LoginPlayerRequest extends PlayerAuthRequestOptions {
  playerName: string;
  password: string;
}

export interface RegisterPlayerRequest extends PlayerAuthRequestOptions {
  playerName: string;
  password: string;
}

export interface ChangePlayerPasswordRequest extends PlayerAuthRequestOptions {
  currentPassword: string;
  newPassword: string;
}

const KNOWN_ERROR_CODES: readonly PlayerAuthApiErrorCode[] = [
  "invalid-request",
  "unknown-operator",
  "invalid-password",
  "operator-exists",
  "unauthenticated",
  "forbidden",
];

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function resolveApiBase(apiBase: string | undefined): string {
  const trimmed = getTrimmedNonEmptyString(apiBase) ?? DEFAULT_PLAYER_AUTH_API_BASE;
  return trimmed.replace(/\/+$/, "");
}

function resolveFetch(fetchFn: typeof fetch | undefined): typeof fetch {
  const resolved = fetchFn ?? fetch;
  if (typeof resolved !== "function") {
    throw new Error("fetchFn must be available to call the auth API.");
  }

  return resolved;
}

function toErrorCode(value: unknown): PlayerAuthApiErrorCode {
  return KNOWN_ERROR_CODES.includes(value as PlayerAuthApiErrorCode)
    ? (value as PlayerAuthApiErrorCode)
    : "unknown";
}

function isAuthenticatedPlayerSummary(value: unknown): value is AuthenticatedPlayerSummary {
  return (
    !!value &&
    typeof value === "object" &&
    getTrimmedNonEmptyString((value as AuthenticatedPlayerSummary).playerName) !== null
  );
}

async function readEnvelope(response: Response): Promise<PlayerAuthApiEnvelope | null> {
  const payload = (await response.json().catch(() => null)) as unknown;
  return payload && typeof payload === "object" ? (payload as PlayerAuthApiEnvelope) : null;
}

function throwForErrorResponse(
  response: Response,
  envelope: PlayerAuthApiEnvelope | null,
  fallbackMessage: string,
): never {
  throw new PlayerAuthApiError(
    toErrorCode(envelope?.error?.code),
    getTrimmedNonEmptyString(envelope?.error?.message) ??
      `${fallbackMessage} (status ${response.status}).`,
    response.status,
  );
}

async function postJson(
  path: string,
  body: Record<string, unknown>,
  options: PlayerAuthRequestOptions,
  fallbackMessage: string,
): Promise<PlayerAuthApiEnvelope | null> {
  const fetchFn = resolveFetch(options.fetchFn);
  const response = await fetchFn(`${resolveApiBase(options.apiBase)}${path}`, {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });

  const envelope = await readEnvelope(response);
  if (!response.ok) {
    throwForErrorResponse(response, envelope, fallbackMessage);
  }

  return envelope;
}

function requirePlayerFromEnvelope(
  envelope: PlayerAuthApiEnvelope | null,
  fallbackMessage: string,
): AuthenticatedPlayerSummary {
  const player = envelope?.data?.player;
  if (!isAuthenticatedPlayerSummary(player)) {
    throw new PlayerAuthApiError("unknown", fallbackMessage, 500);
  }

  return { playerName: player.playerName };
}

/** Logs in and sets the HttpOnly session cookie. */
export async function loginPlayer(request: LoginPlayerRequest): Promise<AuthenticatedPlayerSummary> {
  const envelope = await postJson(
    "/login",
    { playerName: request.playerName, password: request.password },
    request,
    "Unable to log in",
  );
  return requirePlayerFromEnvelope(envelope, "Login response did not include the operator.");
}

/** Creates a new operator with the given password and logs in. */
export async function registerPlayer(
  request: RegisterPlayerRequest,
): Promise<AuthenticatedPlayerSummary> {
  const envelope = await postJson(
    "/register",
    { playerName: request.playerName, password: request.password },
    request,
    "Unable to register",
  );
  return requirePlayerFromEnvelope(
    envelope,
    "Registration response did not include the operator.",
  );
}

/** Changes the logged-in operator's password after confirming the current one. */
export async function changePlayerPassword(
  request: ChangePlayerPasswordRequest,
): Promise<AuthenticatedPlayerSummary> {
  const envelope = await postJson(
    "/change-password",
    { currentPassword: request.currentPassword, newPassword: request.newPassword },
    request,
    "Unable to change password",
  );
  return requirePlayerFromEnvelope(
    envelope,
    "Change-password response did not include the operator.",
  );
}

/** The operator behind the current session cookie, or `null` when logged out. */
export async function fetchCurrentPlayerSession(
  options: PlayerAuthRequestOptions = {},
): Promise<AuthenticatedPlayerSummary | null> {
  const fetchFn = resolveFetch(options.fetchFn);
  const response = await fetchFn(`${resolveApiBase(options.apiBase)}/session`, {
    method: "GET",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  const envelope = await readEnvelope(response);
  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throwForErrorResponse(response, envelope, "Unable to read the current session");
  }

  const player = envelope?.data?.player;
  return isAuthenticatedPlayerSummary(player) ? { playerName: player.playerName } : null;
}

/** Ends the current session and clears the cookie. */
export async function logoutPlayer(options: PlayerAuthRequestOptions = {}): Promise<void> {
  const fetchFn = resolveFetch(options.fetchFn);
  const response = await fetchFn(`${resolveApiBase(options.apiBase)}/session`, {
    method: "DELETE",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throwForErrorResponse(response, await readEnvelope(response), "Unable to log out");
  }
}
