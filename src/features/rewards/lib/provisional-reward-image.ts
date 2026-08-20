export const PROVISIONAL_REWARD_IMAGE_PATH = "/window.svg";

/**
 * True when a reward image path is the stand-in used while generation is
 * still running (or no path exists yet), meaning the UI should render a
 * loading spinner instead of an image.
 */
export function isProvisionalRewardImagePath(
  imagePath: string | null | undefined,
): imagePath is "" | null | undefined | typeof PROVISIONAL_REWARD_IMAGE_PATH {
  return !imagePath || imagePath === PROVISIONAL_REWARD_IMAGE_PATH;
}
