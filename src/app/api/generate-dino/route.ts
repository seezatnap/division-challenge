import { NextRequest, NextResponse } from "next/server";
import { generateDinoImage } from "@/lib/gemini";
import { saveDinoImage } from "@/lib/image-storage";

/**
 * POST /api/generate-dino
 *
 * Accepts { dinoName: string } and returns the generated image's
 * public path along with original base64 data and MIME type.
 *
 * Response: { imagePath: string, base64Data: string, mimeType: string }
 */
export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body !== "object" ||
    !("dinoName" in body) ||
    typeof (body as Record<string, unknown>).dinoName !== "string"
  ) {
    return NextResponse.json(
      { error: "Request body must include a 'dinoName' string." },
      { status: 400 },
    );
  }

  const dinoName = ((body as Record<string, unknown>).dinoName as string).trim();
  if (dinoName.length === 0) {
    return NextResponse.json(
      { error: "'dinoName' must be a non-empty string." },
      { status: 400 },
    );
  }

  try {
    const image = await generateDinoImage(dinoName);
    const imagePath = await saveDinoImage(
      dinoName,
      image.base64Data,
      image.mimeType,
    );
    return NextResponse.json({
      imagePath,
      base64Data: image.base64Data,
      mimeType: image.mimeType,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Image generation failed.";
    console.error("generate-dino error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
