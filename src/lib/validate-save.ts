import type { PlayerSave, DifficultyTier } from "@/types";

/** Checks whether a value is a valid DifficultyTier (1–5). */
function isValidDifficulty(value: unknown): value is DifficultyTier {
  return typeof value === "number" && [1, 2, 3, 4, 5].includes(value);
}

/** Checks whether a string is a plausible ISO-8601 date. */
function isISODateString(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const d = new Date(value);
  return !isNaN(d.getTime());
}

/**
 * Validate raw JSON data against the PlayerSave schema.
 * Returns an object with `valid` boolean and an array of `errors`.
 */
export function validatePlayerSave(
  data: unknown
): { valid: true; data: PlayerSave } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { valid: false, errors: ["Save data must be a JSON object."] };
  }

  const obj = data as Record<string, unknown>;

  // version
  if (obj.version !== 1) {
    errors.push(`Invalid or missing version (expected 1, got ${obj.version}).`);
  }

  // playerName
  if (typeof obj.playerName !== "string" || obj.playerName.trim() === "") {
    errors.push("playerName must be a non-empty string.");
  }

  // totalProblemsSolved
  if (
    typeof obj.totalProblemsSolved !== "number" ||
    !Number.isInteger(obj.totalProblemsSolved) ||
    obj.totalProblemsSolved < 0
  ) {
    errors.push("totalProblemsSolved must be a non-negative integer.");
  }

  // currentDifficulty
  if (!isValidDifficulty(obj.currentDifficulty)) {
    errors.push("currentDifficulty must be an integer 1–5.");
  }

  // unlockedDinosaurs
  if (!Array.isArray(obj.unlockedDinosaurs)) {
    errors.push("unlockedDinosaurs must be an array.");
  } else {
    for (let i = 0; i < obj.unlockedDinosaurs.length; i++) {
      const dino = obj.unlockedDinosaurs[i] as Record<string, unknown>;
      if (typeof dino?.name !== "string" || dino.name.trim() === "") {
        errors.push(`unlockedDinosaurs[${i}].name must be a non-empty string.`);
      }
      if (typeof dino?.imagePath !== "string") {
        errors.push(`unlockedDinosaurs[${i}].imagePath must be a string.`);
      }
      if (!isISODateString(dino?.dateEarned)) {
        errors.push(
          `unlockedDinosaurs[${i}].dateEarned must be a valid ISO-8601 date string.`
        );
      }
    }
  }

  // sessionHistory
  if (!Array.isArray(obj.sessionHistory)) {
    errors.push("sessionHistory must be an array.");
  } else {
    for (let i = 0; i < obj.sessionHistory.length; i++) {
      const session = obj.sessionHistory[i] as Record<string, unknown>;
      if (!isISODateString(session?.startedAt)) {
        errors.push(
          `sessionHistory[${i}].startedAt must be a valid ISO-8601 date string.`
        );
      }
      if (
        session?.endedAt !== undefined &&
        !isISODateString(session?.endedAt)
      ) {
        errors.push(
          `sessionHistory[${i}].endedAt must be a valid ISO-8601 date string or undefined.`
        );
      }
      if (
        typeof session?.problemsSolved !== "number" ||
        !Number.isInteger(session.problemsSolved) ||
        (session.problemsSolved as number) < 0
      ) {
        errors.push(
          `sessionHistory[${i}].problemsSolved must be a non-negative integer.`
        );
      }
      if (
        typeof session?.problemsAttempted !== "number" ||
        !Number.isInteger(session.problemsAttempted) ||
        (session.problemsAttempted as number) < 0
      ) {
        errors.push(
          `sessionHistory[${i}].problemsAttempted must be a non-negative integer.`
        );
      }
      if (!isValidDifficulty(session?.startDifficulty)) {
        errors.push(
          `sessionHistory[${i}].startDifficulty must be an integer 1–5.`
        );
      }
      if (!isValidDifficulty(session?.endDifficulty)) {
        errors.push(
          `sessionHistory[${i}].endDifficulty must be an integer 1–5.`
        );
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, data: data as PlayerSave };
}
