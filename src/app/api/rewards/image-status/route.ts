import { NextResponse } from "next/server";

import { getRewardImageGenerationStatus } from "@/features/rewards/lib/reward-image-cache";
import {
  RewardImageGenerationError,
  toRewardImageApiErrorResponse,
} from "@/features/rewards/lib/reward-image-service";

export const runtime = "nodejs";

function parseDinosaurNameFromRequest(request: Request): string {
  const requestUrl = new URL(request.url);
  const dinosaurName = requestUrl.searchParams.get("dinosaurName")?.trim() ?? "";

  if (dinosaurName.length === 0) {
    throw new RewardImageGenerationError(
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
    const status = await getRewardImageGenerationStatus(dinosaurName);

    return NextResponse.json({ data: status }, { status: 200 });
  } catch (error) {
    const { status, body } = toRewardImageApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
