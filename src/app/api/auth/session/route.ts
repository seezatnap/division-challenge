import { NextResponse } from "next/server";

import {
  buildExpiredPlayerSessionCookie,
  isSecureRequest,
  readPlayerSessionTokenFromRequest,
  requirePlayerSession,
  toAuthenticatedPlayerPayload,
  toPlayerAuthErrorResponse,
} from "@/features/persistence/lib/player-session";
import { deletePlayerSession } from "@/features/persistence/lib/sqlite-player-auth";

export const runtime = "nodejs";

/** GET /api/auth/session — who the session cookie belongs to (401 when logged out). */
export async function GET(request: Request): Promise<Response> {
  try {
    const session = await requirePlayerSession(request);
    return NextResponse.json(
      { data: { player: toAuthenticatedPlayerPayload(session) } },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return toPlayerAuthErrorResponse(error, "Unable to read the current session.");
  }
}

/** DELETE /api/auth/session — logs out: revokes the session and clears the cookie. */
export async function DELETE(request: Request): Promise<Response> {
  try {
    await deletePlayerSession(readPlayerSessionTokenFromRequest(request));
    return NextResponse.json(
      { data: { loggedOut: true } },
      {
        status: 200,
        headers: {
          "Set-Cookie": buildExpiredPlayerSessionCookie({ secure: isSecureRequest(request) }),
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    return toPlayerAuthErrorResponse(error, "Unable to log out.");
  }
}
