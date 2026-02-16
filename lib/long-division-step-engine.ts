import { isDivisionProblem, type DivisionProblem } from "./domain";

export const LONG_DIVISION_STEP_ORDER = [
  "divide",
  "multiply",
  "subtract",
  "bring-down",
] as const;

export type LongDivisionStepId = (typeof LONG_DIVISION_STEP_ORDER)[number];

export interface LongDivisionCycle {
  partialDividend: number;
  quotientDigit: number;
  product: number;
  difference: number;
  broughtDownDigit: number | null;
  nextPartialDividend: number | null;
}

interface LongDivisionExpectedStep {
  step: LongDivisionStepId;
  cycleIndex: number;
  expectedValue: number;
  cycle: LongDivisionCycle;
}

export interface LongDivisionStepState {
  problem: DivisionProblem;
  cycles: readonly LongDivisionCycle[];
  currentStepIndex: number;
  sequence: readonly LongDivisionExpectedStep[];
}

export interface LongDivisionCurrentStep {
  step: LongDivisionStepId;
  cycleIndex: number;
  expectedValue: number;
  partialDividend: number;
  divisor: number;
  difference: number;
  broughtDownDigit: number | null;
}

export interface LongDivisionStepValidationResult {
  state: LongDivisionStepState;
  step: LongDivisionStepId | null;
  expectedValue: number | null;
  inputValue: number | null;
  isCorrect: boolean;
  isComplete: boolean;
  hint: string | null;
}

function parseDigits(value: number): number[] {
  return value.toString().split("").map((digit) => Number.parseInt(digit, 10));
}

function parseStepInput(input: number | string): number | null {
  if (typeof input === "number") {
    return Number.isInteger(input) && input >= 0 ? input : null;
  }

  if (typeof input !== "string") {
    return null;
  }

  const trimmed = input.trim();

  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  return Number.parseInt(trimmed, 10);
}

function buildLongDivisionCycles(problem: DivisionProblem): LongDivisionCycle[] {
  const dividendDigits = parseDigits(problem.dividend);
  let nextDigitIndex = 1;
  let partialDividend = dividendDigits[0];
  const cycles: LongDivisionCycle[] = [];
  const quotientDigits: number[] = [];

  while (partialDividend < problem.divisor && nextDigitIndex < dividendDigits.length) {
    partialDividend = (partialDividend * 10) + dividendDigits[nextDigitIndex];
    nextDigitIndex += 1;
  }

  while (true) {
    const quotientDigit = Math.floor(partialDividend / problem.divisor);
    const product = quotientDigit * problem.divisor;
    const difference = partialDividend - product;
    quotientDigits.push(quotientDigit);

    let broughtDownDigit: number | null = null;
    let nextPartialDividend: number | null = null;

    if (nextDigitIndex < dividendDigits.length) {
      broughtDownDigit = dividendDigits[nextDigitIndex];
      nextPartialDividend = (difference * 10) + broughtDownDigit;
      nextDigitIndex += 1;
    }

    cycles.push({
      partialDividend,
      quotientDigit,
      product,
      difference,
      broughtDownDigit,
      nextPartialDividend,
    });

    if (nextPartialDividend === null) {
      break;
    }

    partialDividend = nextPartialDividend;
  }

  const derivedQuotient = Number(quotientDigits.join(""));
  const finalDifference = cycles[cycles.length - 1]?.difference ?? 0;

  if (
    derivedQuotient !== problem.quotient ||
    finalDifference !== problem.remainder
  ) {
    throw new Error(
      "Division problem values are inconsistent with long division step expectations.",
    );
  }

  return cycles;
}

function buildLongDivisionSequence(
  cycles: readonly LongDivisionCycle[],
): LongDivisionExpectedStep[] {
  const sequence: LongDivisionExpectedStep[] = [];

  cycles.forEach((cycle, cycleIndex) => {
    sequence.push({
      step: "divide",
      cycleIndex,
      expectedValue: cycle.quotientDigit,
      cycle,
    });
    sequence.push({
      step: "multiply",
      cycleIndex,
      expectedValue: cycle.product,
      cycle,
    });
    sequence.push({
      step: "subtract",
      cycleIndex,
      expectedValue: cycle.difference,
      cycle,
    });

    if (cycle.nextPartialDividend !== null) {
      sequence.push({
        step: "bring-down",
        cycleIndex,
        expectedValue: cycle.nextPartialDividend,
        cycle,
      });
    }
  });

  return sequence;
}

function getCurrentExpectedStep(
  state: LongDivisionStepState,
): LongDivisionExpectedStep | null {
  return state.sequence[state.currentStepIndex] ?? null;
}

function buildStepHint(
  expectedStep: LongDivisionExpectedStep,
  divisor: number,
  inputValue: number,
): string {
  const { step, expectedValue, cycle } = expectedStep;

  if (step === "divide") {
    if (inputValue > expectedValue) {
      return `That quotient digit is too large. ${divisor} × ${inputValue} is greater than ${cycle.partialDividend}.`;
    }

    return `That quotient digit is too small. Increase it so ${divisor} × digit gets as close as possible to ${cycle.partialDividend} without going over.`;
  }

  if (step === "multiply") {
    return `Multiply the divisor ${divisor} by the quotient digit ${cycle.quotientDigit}.`;
  }

  if (step === "subtract") {
    return `Subtract ${cycle.product} from ${cycle.partialDividend}.`;
  }

  if (cycle.broughtDownDigit === null) {
    return "No more digits are available to bring down.";
  }

  return `Bring down the next dividend digit (${cycle.broughtDownDigit}) next to ${cycle.difference}.`;
}

export function createLongDivisionStepState(
  problem: DivisionProblem,
): LongDivisionStepState {
  if (!isDivisionProblem(problem)) {
    throw new Error("A valid division problem is required to build step state.");
  }

  const cycles = buildLongDivisionCycles(problem);
  const sequence = buildLongDivisionSequence(cycles);

  return {
    problem,
    cycles,
    currentStepIndex: 0,
    sequence,
  };
}

export function isLongDivisionStepStateComplete(
  state: LongDivisionStepState,
): boolean {
  return state.currentStepIndex >= state.sequence.length;
}

export function getCurrentLongDivisionStep(
  state: LongDivisionStepState,
): LongDivisionCurrentStep | null {
  const expectedStep = getCurrentExpectedStep(state);

  if (!expectedStep) {
    return null;
  }

  return {
    step: expectedStep.step,
    cycleIndex: expectedStep.cycleIndex,
    expectedValue: expectedStep.expectedValue,
    partialDividend: expectedStep.cycle.partialDividend,
    divisor: state.problem.divisor,
    difference: expectedStep.cycle.difference,
    broughtDownDigit: expectedStep.cycle.broughtDownDigit,
  };
}

export function validateLongDivisionStepInput(
  state: LongDivisionStepState,
  input: number | string,
): LongDivisionStepValidationResult {
  const expectedStep = getCurrentExpectedStep(state);

  if (!expectedStep) {
    return {
      state,
      step: null,
      expectedValue: null,
      inputValue: null,
      isCorrect: false,
      isComplete: true,
      hint: "This problem is already complete.",
    };
  }

  const inputValue = parseStepInput(input);

  if (inputValue === null) {
    return {
      state,
      step: expectedStep.step,
      expectedValue: expectedStep.expectedValue,
      inputValue: null,
      isCorrect: false,
      isComplete: false,
      hint: "Enter a non-negative whole number.",
    };
  }

  if (inputValue !== expectedStep.expectedValue) {
    return {
      state,
      step: expectedStep.step,
      expectedValue: expectedStep.expectedValue,
      inputValue,
      isCorrect: false,
      isComplete: false,
      hint: buildStepHint(expectedStep, state.problem.divisor, inputValue),
    };
  }

  const nextState: LongDivisionStepState = {
    ...state,
    currentStepIndex: state.currentStepIndex + 1,
  };

  return {
    state: nextState,
    step: expectedStep.step,
    expectedValue: expectedStep.expectedValue,
    inputValue,
    isCorrect: true,
    isComplete: isLongDivisionStepStateComplete(nextState),
    hint: null,
  };
}
