import { NextResponse } from "next/server";

import {
  buildPlayerSessionCookie,
  isSecureRequest,
  toAuthenticatedPlayerPayload,
  toPlayerAuthErrorResponse,
} from "@/features/persistence/lib/player-session";
import {
  authenticatePlayer,
  createPlayerSession,
} from "@/features/persistence/lib/sqlite-player-auth";

export const runtime = "nodejs";

interface LoginRequestBody {
  playerName?: unknown;
  password?: unknown;
}

async function parseJsonBody(request: Request): Promise<LoginRequestBody> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object") {
      throw new Error("Request body must be a JSON object.");
    }

    return body as LoginRequestBody;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message === "Request body must be a JSON object."
        ? error.message
        : "Request body must be valid JSON.",
    );
  }
}

/** POST /api/auth/login — verifies the password and issues the session cookie. */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = await parseJsonBody(request);
    const player = await authenticatePlayer({
      playerName: body.playerName,
      password: body.password,
    });
    const session = await createPlayerSession(player);

    return NextResponse.json(
      { data: { player: toAuthenticatedPlayerPayload(player) } },
      {
        status: 200,
        headers: {
          "Set-Cookie": buildPlayerSessionCookie({
            token: session.token,
            expiresAtMs: session.expiresAtMs,
            secure: isSecureRequest(request),
          }),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return toPlayerAuthErrorResponse(error, "Unable to log in.");
  }
}
