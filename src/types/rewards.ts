// ---------------------------------------------------------------------------
// Unlocked Rewards (Dinosaur Gallery Items)
// ---------------------------------------------------------------------------

/** A single dinosaur reward that has been unlocked. */
export interface UnlockedReward {
  /** Dinosaur name (must match a value from the 100-dino constant list). */
  dinoName: string;
  /** Path to the generated image on the server (relative to public/). */
  imagePath: string;
  /** ISO-8601 timestamp when the reward was earned. */
  earnedAt: string;
  /** The milestone number (1 = first reward at 5 solved, 2 = at 10, etc.). */
  milestoneNumber: number;
}

/** Generation status for a reward that is being prefetched or in flight. */
export enum RewardGenerationStatus {
  /** Not yet started. */
  Pending = "pending",
  /** Image generation request is in flight. */
  Generating = "generating",
  /** Image is ready on disk. */
  Ready = "ready",
  /** Generation failed (will retry on next trigger). */
  Failed = "failed",
}

/** Tracks the state of a reward that may still be generating. */
export interface RewardGenerationState {
  /** Which dinosaur is being generated. */
  dinoName: string;
  /** Current generation status. */
  status: RewardGenerationStatus;
  /** Milestone number this reward corresponds to. */
  milestoneNumber: number;
}
