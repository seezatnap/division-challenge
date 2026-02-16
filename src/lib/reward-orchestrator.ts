/**
 * Reward orchestration module.
 *
 * Consumes every-5-solved triggers from the progression system, picks an
 * unearned dinosaur from the 100-item pool, calls the server-side Gemini
 * generation endpoint, and appends the unlocked dinosaur metadata (name,
 * image path, date earned) to the player save.
 */

import type { PlayerSave, UnlockedDinosaur } from "@/types";
import { getNextUnlockedDinosaur } from "@/data/dinosaurs";

// ─── Types ──────────────────────────────────────────────────

/** Successful reward result with the new dino and updated save. */
export interface RewardSuccess {
  status: "success";
  /** The dinosaur that was unlocked. */
  unlocked: UnlockedDinosaur;
  /** The player save with the new dinosaur appended. */
  updatedSave: PlayerSave;
}

/** All 100 dinosaurs already unlocked — nothing left to award. */
export interface RewardPoolExhausted {
  status: "pool_exhausted";
}

/** The Gemini API call or image save failed. */
export interface RewardError {
  status: "error";
  message: string;
}

export type RewardResult = RewardSuccess | RewardPoolExhausted | RewardError;

// ─── API response shape ─────────────────────────────────────

interface GenerateDinoResponse {
  imagePath: string;
  base64Data: string;
  mimeType: string;
}

// ─── Orchestrator ───────────────────────────────────────────

/**
 * Process a reward trigger by selecting the next unearned dinosaur,
 * generating its image via the Gemini API endpoint, and appending the
 * unlocked metadata to the player save.
 *
 * @param playerSave - The current player save (used to determine which
 *   dinosaurs are already unlocked).
 * @param fetchFn - Optional fetch implementation (defaults to global
 *   `fetch`). Allows injection for testing.
 * @returns A {@link RewardResult} describing the outcome.
 */
export async function processReward(
  playerSave: PlayerSave,
  fetchFn: typeof fetch = fetch,
): Promise<RewardResult> {
  // 1. Pick an unearned dinosaur from the pool
  const alreadyUnlocked = playerSave.unlockedDinosaurs.map((d) => d.name);
  const chosenDino = getNextUnlockedDinosaur(alreadyUnlocked);

  if (chosenDino === null) {
    return { status: "pool_exhausted" };
  }

  // 2. Call the Gemini generation endpoint
  let imagePath: string;
  try {
    const response = await fetchFn("/api/generate-dino", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dinoName: chosenDino }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message =
        (errorBody as Record<string, unknown>).error ??
        `HTTP ${response.status}`;
      return { status: "error", message: String(message) };
    }

    const data = (await response.json()) as GenerateDinoResponse;
    imagePath = data.imagePath;
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Network request failed.";
    return { status: "error", message };
  }

  // 3. Build the unlocked-dinosaur metadata
  const unlocked: UnlockedDinosaur = {
    name: chosenDino,
    imagePath,
    dateEarned: new Date().toISOString(),
  };

  // 4. Append to player save (immutable update)
  const updatedSave: PlayerSave = {
    ...playerSave,
    unlockedDinosaurs: [...playerSave.unlockedDinosaurs, unlocked],
  };

  return { status: "success", unlocked, updatedSave };
}
