/**
 * POST /api/generate-dino
 *
 * Triggers dinosaur image generation via Gemini, with filesystem caching.
 * If the image already exists on disk the API returns immediately without
 * calling Gemini (no duplicate generation).
 *
 * Request body:
 *   { dinosaurName: string; sceneHint?: string }
 *
 * Response (success):
 *   { success: true; imagePath: string; fromCache: boolean }
 *
 * Response (error):
 *   { success: false; error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { generateDinoImageCached } from "@/features/rewards/dino-image-cache";

interface GenerateDinoRequestBody {
  dinosaurName?: string;
  sceneHint?: string;
}

export async function POST(request: NextRequest) {
  let body: GenerateDinoRequestBody;

  try {
    body = (await request.json()) as GenerateDinoRequestBody;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON in request body." },
      { status: 400 },
    );
  }

  const dinosaurName = body.dinosaurName?.trim();

  if (!dinosaurName) {
    return NextResponse.json(
      { success: false, error: "dinosaurName is required." },
      { status: 400 },
    );
  }

  const outcome = await generateDinoImageCached({
    dinosaurName,
    sceneHint: body.sceneHint,
  });

  if (!outcome.success) {
    return NextResponse.json(
      { success: false, error: outcome.error },
      { status: 502 },
    );
  }

  return NextResponse.json({
    success: true,
    imagePath: outcome.imagePath,
    fromCache: outcome.fromCache,
  });
}
