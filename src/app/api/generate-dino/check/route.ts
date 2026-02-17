/**
 * GET /api/generate-dino/check?name=<dinosaurName>
 *
 * Checks whether a dinosaur image already exists in the filesystem cache.
 * Used by prefetch logic and the reward UI to avoid duplicate generation.
 *
 * Query params:
 *   name - The dinosaur display name (required)
 *
 * Response:
 *   { exists: boolean; imagePath?: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { findCachedImage } from "@/features/rewards/dino-image-cache";

export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name")?.trim();

  if (!name) {
    return NextResponse.json(
      { exists: false, error: "name query parameter is required." },
      { status: 400 },
    );
  }

  const result = findCachedImage(name);

  if (result.cached) {
    return NextResponse.json({
      exists: true,
      imagePath: result.imagePath,
    });
  }

  return NextResponse.json({ exists: false });
}
