export const DIVISION_DIFFICULTY_IDS = [
  "two-digit-by-one-digit",
  "three-digit-by-one-digit",
  "four-digit-by-two-digit",
  "four-to-five-digit-by-two-to-three-digit",
] as const;

export type DivisionDifficultyId = (typeof DIVISION_DIFFICULTY_IDS)[number];

export interface DivisionDifficultyDefinition {
  id: DivisionDifficultyId;
  label: string;
  dividendDigits: readonly [min: number, max: number];
  divisorDigits: readonly [min: number, max: number];
}

export const DIVISION_DIFFICULTIES: readonly DivisionDifficultyDefinition[] = [
  {
    id: "two-digit-by-one-digit",
    label: "2-digit ÷ 1-digit",
    dividendDigits: [2, 2],
    divisorDigits: [1, 1],
  },
  {
    id: "three-digit-by-one-digit",
    label: "3-digit ÷ 1-digit",
    dividendDigits: [3, 3],
    divisorDigits: [1, 1],
  },
  {
    id: "four-digit-by-two-digit",
    label: "4-digit ÷ 2-digit",
    dividendDigits: [4, 4],
    divisorDigits: [2, 2],
  },
  {
    id: "four-to-five-digit-by-two-to-three-digit",
    label: "4-5 digit ÷ 2-3 digit",
    dividendDigits: [4, 5],
    divisorDigits: [2, 3],
  },
];

export interface DivisionProblem {
  id: string;
  dividend: number;
  divisor: number;
  quotient: number;
  remainder: number;
  difficulty: DivisionDifficultyId;
  createdAt: string;
}

export interface UnlockedDinosaur {
  name: string;
  imagePath: string;
  earnedAt: string;
}

export interface SessionHistoryEntry {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  problemsSolved: number;
}

export interface PlayerSaveFile {
  playerName: string;
  totalProblemsSolved: number;
  currentDifficulty: DivisionDifficultyId;
  unlockedDinosaurs: UnlockedDinosaur[];
  sessionHistory: SessionHistoryEntry[];
}

const difficultyIdSet: ReadonlySet<string> = new Set(DIVISION_DIFFICULTY_IDS);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function isDivisionDifficultyId(
  value: unknown,
): value is DivisionDifficultyId {
  return typeof value === "string" && difficultyIdSet.has(value);
}

export function isDivisionProblem(value: unknown): value is DivisionProblem {
  if (!isObject(value)) {
    return false;
  }

  const {
    id,
    dividend,
    divisor,
    quotient,
    remainder,
    difficulty,
    createdAt,
  } = value;

  if (
    !isNonEmptyString(id) ||
    !isNonNegativeInteger(dividend) ||
    !isNonNegativeInteger(divisor) ||
    !isNonNegativeInteger(quotient) ||
    !isNonNegativeInteger(remainder) ||
    !isDivisionDifficultyId(difficulty) ||
    !isIsoDate(createdAt)
  ) {
    return false;
  }

  return (
    divisor > 0 &&
    remainder < divisor &&
    dividend === (divisor * quotient) + remainder
  );
}

export function isUnlockedDinosaur(value: unknown): value is UnlockedDinosaur {
  if (!isObject(value)) {
    return false;
  }

  return (
    isNonEmptyString(value.name) &&
    isNonEmptyString(value.imagePath) &&
    isIsoDate(value.earnedAt)
  );
}

export function isSessionHistoryEntry(
  value: unknown,
): value is SessionHistoryEntry {
  if (!isObject(value)) {
    return false;
  }

  const endedAtIsValid = value.endedAt === null || isIsoDate(value.endedAt);

  return (
    isNonEmptyString(value.sessionId) &&
    isIsoDate(value.startedAt) &&
    endedAtIsValid &&
    isNonNegativeInteger(value.problemsSolved)
  );
}

export function isPlayerSaveFile(value: unknown): value is PlayerSaveFile {
  if (!isObject(value)) {
    return false;
  }

  if (
    !isNonEmptyString(value.playerName) ||
    !isNonNegativeInteger(value.totalProblemsSolved) ||
    !isDivisionDifficultyId(value.currentDifficulty) ||
    !Array.isArray(value.unlockedDinosaurs) ||
    !Array.isArray(value.sessionHistory)
  ) {
    return false;
  }

  return (
    value.unlockedDinosaurs.every(isUnlockedDinosaur) &&
    value.sessionHistory.every(isSessionHistoryEntry)
  );
}

export function createNewPlayerSave(playerName: string): PlayerSaveFile {
  const trimmedName = playerName.trim();

  if (!trimmedName) {
    throw new Error("Player name is required to create a save file.");
  }

  return {
    playerName: trimmedName,
    totalProblemsSolved: 0,
    currentDifficulty: DIVISION_DIFFICULTY_IDS[0],
    unlockedDinosaurs: [],
    sessionHistory: [],
  };
}
