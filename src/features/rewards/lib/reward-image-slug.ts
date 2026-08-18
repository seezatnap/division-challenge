/**
 * Pure helpers shared by server and client code for naming reward images.
 * Deliberately free of any storage/database imports so client bundles that
 * need the slug (milestone image paths) stay lightweight.
 */

export const REWARD_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "svg"] as const;
export type RewardImageExtension = (typeof REWARD_IMAGE_EXTENSIONS)[number];

function getTrimmedNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

export function toRewardImageCacheSlug(dinosaurName: string): string {
  const normalizedName = getTrimmedNonEmptyString(dinosaurName);
  if (!normalizedName) {
    throw new Error("dinosaurName must be a non-empty string.");
  }

  const slug = normalizedName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (slug.length === 0) {
    throw new Error("dinosaurName must include alphanumeric characters.");
  }

  return slug;
}

/** Parses `<slug>.<ext>` reward image file names (as used by `/rewards/<file>`). */
export function parseRewardImageFileName(
  fileName: string,
): { slug: string; extension: RewardImageExtension } | null {
  const match = /^([a-z0-9](?:[a-z0-9-]*[a-z0-9])?)\.([a-z0-9]+)$/i.exec(fileName.trim());
  if (!match) {
    return null;
  }

  const [, slug, rawExtension] = match;
  const extension = rawExtension.toLowerCase();
  if (!REWARD_IMAGE_EXTENSIONS.includes(extension as RewardImageExtension)) {
    return null;
  }

  return { slug: slug.toLowerCase(), extension: extension as RewardImageExtension };
}
