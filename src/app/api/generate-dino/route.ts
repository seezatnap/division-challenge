/**
 * POST /api/generate-dino
 *
 * Triggers dinosaur image generation via Gemini.
 *
 * Request body:
 *   { dinosaurName: string; sceneHint?: string }
 *
 * Response (success):
 *   { success: true; image: { base64Data: string; mimeType: string } }
 *
 * Response (error):
 *   { success: false; error: string }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  generateDinoImage,
  extensionForMimeType,
} from "@/features/rewards/gemini-image-service";

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

  const outcome = await generateDinoImage({
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
    image: {
      base64Data: outcome.image.base64Data,
      mimeType: outcome.image.mimeType,
      extension: extensionForMimeType(outcome.image.mimeType),
    },
  });
}
