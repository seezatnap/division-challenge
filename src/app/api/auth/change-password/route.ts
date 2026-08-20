import { NextResponse } from "next/server";

import {
  requirePlayerSession,
  toAuthenticatedPlayerPayload,
  toPlayerAuthErrorResponse,
} from "@/features/persistence/lib/player-session";
import { changePlayerPassword } from "@/features/persistence/lib/sqlite-player-auth";

export const runtime = "nodejs";

interface ChangePasswordRequestBody {
  currentPassword?: unknown;
  newPassword?: unknown;
}

async function parseJsonBody(request: Request): Promise<ChangePasswordRequestBody> {
  try {
    const body = (await request.json()) as unknown;
    if (!body || typeof body !== "object") {
      throw new Error("Request body must be a JSON object.");
    }

    return body as ChangePasswordRequestBody;
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message === "Request body must be a JSON object."
        ? error.message
        : "Request body must be valid JSON.",
    );
  }
}

/**
 * POST /api/auth/change-password — for the logged-in operator only; confirms
 * the current password, stores the new hash and revokes every other session.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const session = await requirePlayerSession(request);
    const body = await parseJsonBody(request);
    const player = await changePlayerPassword({
      playerName: session.playerName,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      keepSessionToken: session.token,
    });

    return NextResponse.json(
      { data: { player: toAuthenticatedPlayerPayload(player) } },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return toPlayerAuthErrorResponse(error, "Unable to change password.");
  }
}
