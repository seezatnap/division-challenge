import { NextResponse } from "next/server";

import {
  deleteRewardImageCacheEntry,
  getRewardCacheDatabaseLocation,
  getRewardImageCacheDatabaseRecord,
  listRewardImageCacheDatabaseRecords,
} from "@/features/rewards/lib/reward-image-cache";

export const runtime = "nodejs";

function toTrimmedValue(value: string | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toErrorResponse(message: string, status = 400): Response {
  return NextResponse.json(
    {
      error: {
        message,
      },
    },
    { status },
  );
}

function parseDinosaurNameFromRequest(request: Request): string | null {
  const requestUrl = new URL(request.url);
  return toTrimmedValue(requestUrl.searchParams.get("dinosaurName"));
}

export async function GET(request: Request): Promise<Response> {
  try {
    const dinosaurName = parseDinosaurNameFromRequest(request);
    const databaseLocation = getRewardCacheDatabaseLocation();

    if (dinosaurName) {
      const record = await getRewardImageCacheDatabaseRecord(dinosaurName);
      return NextResponse.json(
        {
          data: {
            database: databaseLocation,
            record,
          },
        },
        { status: 200 },
      );
    }

    const records = await listRewardImageCacheDatabaseRecords();
    return NextResponse.json(
      {
        data: {
          database: databaseLocation,
          count: records.length,
          records,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to read reward cache records.";
    return toErrorResponse(message, 500);
  }
}

export async function DELETE(request: Request): Promise<Response> {
  const dinosaurName = parseDinosaurNameFromRequest(request);
  if (!dinosaurName) {
    return toErrorResponse(
      "dinosaurName query parameter must be a non-empty string for cache deletion.",
      400,
    );
  }

  try {
    const deletionResult = await deleteRewardImageCacheEntry(dinosaurName);
    return NextResponse.json(
      {
        data: {
          ...deletionResult,
          database: getRewardCacheDatabaseLocation(),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to delete reward cache entry.";
    return toErrorResponse(message, 500);
  }
}
