import { getDefaultRewardImageStorage } from "@/features/persistence/lib/object-storage";
import { findCurrentRewardImage } from "@/features/rewards/lib/reward-image-cache";
import { parseRewardImageFileName } from "@/features/rewards/lib/reward-image-slug";

export const runtime = "nodejs";

/**
 * Serves the current reward image for `/rewards/<slug>.<ext>`.
 *
 * Reward images live in object storage; this route streams them through the
 * app so (a) player profiles saved before the storage move keep working with
 * their `/rewards/...` paths and (b) deployments without a public R2 URL can
 * still show images. When `R2_PUBLIC_BASE_URL` is set new image paths point
 * straight at R2 and this route is only hit for legacy paths.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ filename: string }> },
): Promise<Response> {
  const { filename } = await context.params;
  const parsedFileName = parseRewardImageFileName(filename);
  if (!parsedFileName) {
    return new Response("Not found", { status: 404 });
  }

  const storage = getDefaultRewardImageStorage();
  const currentImage = await findCurrentRewardImage(parsedFileName.slug, { storage });
  if (!currentImage) {
    return new Response("Not found", { status: 404 });
  }

  const storedObject = await storage.getObject(currentImage.storageKey);
  if (!storedObject) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(storedObject.body), {
    status: 200,
    headers: {
      "Content-Type": currentImage.mimeType,
      "Content-Length": String(storedObject.body.byteLength),
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      ETag: `"${currentImage.sha256 || currentImage.id}"`,
      "X-Reward-Image-Id": currentImage.id,
    },
  });
}
