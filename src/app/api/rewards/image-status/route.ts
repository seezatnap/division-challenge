import { NextResponse } from "next/server";

import {
  getRewardImageGenerationStatus,
  getRewardImageGenerationStatuses,
} from "@/features/rewards/lib/reward-image-cache";
import {
  RewardImageGenerationError,
  toRewardImageApiErrorResponse,
} from "@/features/rewards/lib/reward-image-service";

export const runtime = "nodejs";

/** Bounds the query size; a full roster is 100 rewards. */
const MAX_BULK_STATUS_NAMES = 200;

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

/**
 * Repeated `dinosaurNames` params ask for many statuses at once:
 * `?dinosaurNames=Triceratops&dinosaurNames=Velociraptor`. Returns them under
 * `data.records`, so a gallery costs one request instead of one per reward.
 */
function parseDinosaurNamesFromRequest(request: Request): readonly string[] {
  const requestUrl = new URL(request.url);
  return requestUrl.searchParams
    .getAll("dinosaurNames")
    .flatMap((value) => value.split("\n"))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

export async function GET(request: Request): Promise<Response> {
  try {
    const dinosaurNames = parseDinosaurNamesFromRequest(request);
    if (dinosaurNames.length > 0) {
      if (dinosaurNames.length > MAX_BULK_STATUS_NAMES) {
        throw new RewardImageGenerationError(
          "INVALID_REQUEST",
          `dinosaurNames accepts at most ${MAX_BULK_STATUS_NAMES} names per request.`,
          400,
        );
      }

      const records = await getRewardImageGenerationStatuses(dinosaurNames);
      return NextResponse.json({ data: { records } }, { status: 200 });
    }

    const dinosaurName = parseDinosaurNameFromRequest(request);
    const status = await getRewardImageGenerationStatus(dinosaurName);

    return NextResponse.json({ data: status }, { status: 200 });
  } catch (error) {
    const { status, body } = toRewardImageApiErrorResponse(error);
    return NextResponse.json(body, { status });
  }
}
