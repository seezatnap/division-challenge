import { NextResponse } from "next/server";

import { getGeminiRewardImageGenerationStatus } from "@/features/rewards/lib/gemini-image-cache";
import {
  GeminiImageGenerationError,
  toGeminiImageApiErrorResponse,
} from "@/features/rewards/lib/gemini-image-service";

export const runtime = "nodejs";

function parseDinosaurNameFromRequest(request: Request): string {
  const requestUrl = new URL(request.url);
  const dinosaurName = requestUrl.searchParams.get("dinosaurName")?.trim() ?? "";

  if (dinosaurName.length === 0) {
    throw new GeminiImageGenerationError(
      "INVALID_DINOSAUR_NAME",
      "dinosaurName query parameter must be a non-empty string.",
      400,
    );
  }

  return dinosaurName;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const dinosaurName = parseDinosaurNameFromRequest(request);
    const status = await getGeminiRewardImageGenerationStatus(dinosaurName);

    return NextResponse.json({ data: status }, { status: 200 });
  } catch (error) {
    const { status, body } = toGeminiImageApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
