import { DifficultyLevel, StepKind } from "@/types";
import type { DivisionProblem, DivisionSolution } from "@/types";
import { solveDivisionProblem } from "@/features/division-engine/solver";
import {
  validateStep,
  createStepValidator,
} from "@/features/division-engine/step-validator";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProblem(
  dividend: number,
  divisor: number,
  difficulty = DifficultyLevel.Easy,
): DivisionProblem {
  const quotient = Math.floor(dividend / divisor);
  const remainder = dividend % divisor;
  return { dividend, divisor, quotient, remainder, difficulty };
}

function solve(dividend: number, divisor: number): DivisionSolution {
  return solveDivisionProblem(makeProblem(dividend, divisor));
}

// ---------------------------------------------------------------------------
// validateStep – correct answers
// ---------------------------------------------------------------------------

describe("validateStep – correct answers", () => {
  it("returns correct=true when the entered value matches the expected value", () => {
    const solution = solve(84, 4);
    // Step 0: QuotientDigit, expected 2
    const result = validateStep(solution, 0, 2);
    expect(result.correct).toBe(true);
    expect(result.enteredValue).toBe(2);
    expect(result.expectedValue).toBe(2);
  });

  it("advances to the next step on correct answer", () => {
    const solution = solve(84, 4);
    const result = validateStep(solution, 0, 2);
    expect(result.nextStepIndex).toBe(1);
  });

  it("returns null hint on correct answer", () => {
    const solution = solve(84, 4);
    const result = validateStep(solution, 0, 2);
    expect(result.hint).toBeNull();
  });

  it("marks isComplete=false when steps remain", () => {
    const solution = solve(84, 4);
    const result = validateStep(solution, 0, 2);
    expect(result.isComplete).toBe(false);
  });

  it("marks isComplete=true on the last step", () => {
    const solution = solve(84, 4);
    // Last step index is 6 (subtract, expected 0)
    const lastIndex = solution.steps.length - 1;
    const lastStep = solution.steps[lastIndex];
    const expectedVal =
      lastStep.kind === StepKind.BringDown
        ? lastStep.digitBroughtDown
        : lastStep.expectedValue;
    const result = validateStep(solution, lastIndex, expectedVal);
    expect(result.correct).toBe(true);
    expect(result.isComplete).toBe(true);
    expect(result.nextStepIndex).toBeNull();
  });

  it("returns the correct step reference", () => {
    const solution = solve(84, 4);
    const result = validateStep(solution, 2, 0); // subtract step, expected 0
    expect(result.step).toBe(solution.steps[2]);
  });
});

// ---------------------------------------------------------------------------
// validateStep – incorrect answers
// ---------------------------------------------------------------------------

describe("validateStep – incorrect answers", () => {
  it("returns correct=false when the entered value does not match", () => {
    const solution = solve(84, 4);
    const result = validateStep(solution, 0, 5); // expected 2
    expect(result.correct).toBe(false);
    expect(result.enteredValue).toBe(5);
    expect(result.expectedValue).toBe(2);
  });

  it("keeps focus on the same step (nextStepIndex = current index)", () => {
    const solution = solve(84, 4);
    const result = validateStep(solution, 0, 5);
    expect(result.nextStepIndex).toBe(0);
  });

  it("returns a non-null hint on incorrect answer", () => {
    const solution = solve(84, 4);
    const result = validateStep(solution, 0, 5);
    expect(result.hint).not.toBeNull();
  });

  it("hint contains the correct stepKind", () => {
    const solution = solve(84, 4);
    const result = validateStep(solution, 0, 5);
    expect(result.hint!.stepKind).toBe(StepKind.QuotientDigit);
  });

  it("hint contains entered and expected values", () => {
    const solution = solve(84, 4);
    const result = validateStep(solution, 0, 5);
    expect(result.hint!.enteredValue).toBe(5);
    expect(result.hint!.expectedValue).toBe(2);
  });

  it("hint contains a non-empty message string", () => {
    const solution = solve(84, 4);
    const result = validateStep(solution, 0, 5);
    expect(result.hint!.hintMessage).toBeTruthy();
    expect(typeof result.hint!.hintMessage).toBe("string");
  });

  it("isComplete=false on incorrect answer even for last step", () => {
    const solution = solve(84, 4);
    const lastIndex = solution.steps.length - 1;
    const result = validateStep(solution, lastIndex, 999);
    expect(result.correct).toBe(false);
    expect(result.isComplete).toBe(false);
    expect(result.nextStepIndex).toBe(lastIndex);
  });
});

// ---------------------------------------------------------------------------
// validateStep – hint messages vary by step kind
// ---------------------------------------------------------------------------

describe("validateStep – hint messages per step kind", () => {
  it("QuotientDigit hint mentions dividing", () => {
    const solution = solve(84, 4);
    const result = validateStep(solution, 0, 9);
    expect(result.hint!.stepKind).toBe(StepKind.QuotientDigit);
    expect(result.hint!.hintMessage.length).toBeGreaterThan(0);
  });

  it("Multiply hint mentions multiplying", () => {
    const solution = solve(84, 4);
    // Step 1 is multiply, expected 8
    const result = validateStep(solution, 1, 3);
    expect(result.hint!.stepKind).toBe(StepKind.Multiply);
    expect(result.hint!.hintMessage.length).toBeGreaterThan(0);
  });

  it("Subtract hint mentions subtracting", () => {
    const solution = solve(84, 4);
    // Step 2 is subtract, expected 0
    const result = validateStep(solution, 2, 5);
    expect(result.hint!.stepKind).toBe(StepKind.Subtract);
    expect(result.hint!.hintMessage.length).toBeGreaterThan(0);
  });

  it("BringDown hint is provided when validated", () => {
    const solution = solve(84, 4);
    // Step 3 is BringDown, digitBroughtDown=4
    const result = validateStep(solution, 3, 9);
    expect(result.hint!.stepKind).toBe(StepKind.BringDown);
    expect(result.hint!.hintMessage.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// validateStep – attempt number affects hints
// ---------------------------------------------------------------------------

describe("validateStep – attempt number cycles hints", () => {
  it("different attempt numbers can produce different hints", () => {
    const solution = solve(84, 4);
    const hint0 = validateStep(solution, 0, 9, 0).hint!;
    const hint1 = validateStep(solution, 0, 9, 1).hint!;
    const hint2 = validateStep(solution, 0, 9, 2).hint!;
    // hint0 and hint1 should differ, hint2 wraps around
    expect(hint0.attemptNumber).toBe(0);
    expect(hint1.attemptNumber).toBe(1);
    expect(hint2.attemptNumber).toBe(2);
    // At minimum, they're all non-empty
    expect(hint0.hintMessage.length).toBeGreaterThan(0);
    expect(hint1.hintMessage.length).toBeGreaterThan(0);
    expect(hint2.hintMessage.length).toBeGreaterThan(0);
  });

  it("hint messages cycle for the same step kind", () => {
    const solution = solve(84, 4);
    const hint0 = validateStep(solution, 0, 9, 0).hint!.hintMessage;
    const hint3 = validateStep(solution, 0, 9, 3).hint!.hintMessage;
    // 3 quotient hints, so attempt 3 wraps to same as attempt 0
    expect(hint3).toBe(hint0);
  });
});

// ---------------------------------------------------------------------------
// validateStep – edge cases
// ---------------------------------------------------------------------------

describe("validateStep – edge cases", () => {
  it("throws RangeError for negative stepIndex", () => {
    const solution = solve(84, 4);
    expect(() => validateStep(solution, -1, 0)).toThrow(RangeError);
  });

  it("throws RangeError for stepIndex beyond last step", () => {
    const solution = solve(84, 4);
    expect(() => validateStep(solution, solution.steps.length, 0)).toThrow(
      RangeError,
    );
  });

  it("validates BringDown steps against digitBroughtDown", () => {
    const solution = solve(84, 4);
    // Step 3: BringDown, digitBroughtDown=4
    const correctResult = validateStep(solution, 3, 4);
    expect(correctResult.correct).toBe(true);
    expect(correctResult.expectedValue).toBe(4);
  });

  it("validates zero quotient digit correctly", () => {
    const solution = solve(7035, 5);
    // Step 8: quotient digit 0
    const result = validateStep(solution, 8, 0);
    expect(result.correct).toBe(true);
    expect(result.expectedValue).toBe(0);
  });

  it("validates zero multiply result correctly", () => {
    const solution = solve(7035, 5);
    // Step 9: multiply 5×0=0
    const result = validateStep(solution, 9, 0);
    expect(result.correct).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createStepValidator – basic flow
// ---------------------------------------------------------------------------

describe("createStepValidator – basic flow", () => {
  it("starts at step 0 with zero attempts", () => {
    const solution = solve(84, 4);
    const validator = createStepValidator(solution);
    const state = validator.getState();
    expect(state.currentStepIndex).toBe(0);
    expect(state.currentAttempts).toBe(0);
    expect(state.isComplete).toBe(false);
    expect(state.totalIncorrectAttempts).toBe(0);
  });

  it("getCurrentStep returns the first step initially", () => {
    const solution = solve(84, 4);
    const validator = createStepValidator(solution);
    expect(validator.getCurrentStep()).toBe(solution.steps[0]);
  });

  it("advances through all steps with correct answers", () => {
    const solution = solve(84, 4);
    const validator = createStepValidator(solution);

    for (const step of solution.steps) {
      const expectedVal =
        step.kind === StepKind.BringDown
          ? step.digitBroughtDown
          : step.expectedValue;
      const result = validator.submit(expectedVal);
      expect(result.correct).toBe(true);
    }

    expect(validator.getState().isComplete).toBe(true);
    expect(validator.getState().totalIncorrectAttempts).toBe(0);
  });

  it("getCurrentStep returns null when complete", () => {
    const solution = solve(84, 4);
    const validator = createStepValidator(solution);

    for (const step of solution.steps) {
      const expectedVal =
        step.kind === StepKind.BringDown
          ? step.digitBroughtDown
          : step.expectedValue;
      validator.submit(expectedVal);
    }

    expect(validator.getCurrentStep()).toBeNull();
  });

  it("throws when submitting after problem is complete", () => {
    const solution = solve(84, 4);
    const validator = createStepValidator(solution);

    for (const step of solution.steps) {
      const expectedVal =
        step.kind === StepKind.BringDown
          ? step.digitBroughtDown
          : step.expectedValue;
      validator.submit(expectedVal);
    }

    expect(() => validator.submit(0)).toThrow("already complete");
  });
});

// ---------------------------------------------------------------------------
// createStepValidator – retry behavior
// ---------------------------------------------------------------------------

describe("createStepValidator – retry on incorrect answers", () => {
  it("stays on the same step after incorrect answer", () => {
    const solution = solve(84, 4);
    const validator = createStepValidator(solution);

    // Step 0: expected quotient digit 2, enter wrong value
    const result = validator.submit(9);
    expect(result.correct).toBe(false);
    expect(validator.getState().currentStepIndex).toBe(0);
    expect(validator.getState().currentAttempts).toBe(1);
  });

  it("tracks multiple incorrect attempts on the same step", () => {
    const solution = solve(84, 4);
    const validator = createStepValidator(solution);

    validator.submit(9); // wrong
    validator.submit(7); // wrong
    validator.submit(3); // wrong

    const state = validator.getState();
    expect(state.currentStepIndex).toBe(0);
    expect(state.currentAttempts).toBe(3);
    expect(state.totalIncorrectAttempts).toBe(3);
  });

  it("resets attempt counter when correct answer is given after retries", () => {
    const solution = solve(84, 4);
    const validator = createStepValidator(solution);

    validator.submit(9); // wrong (attempt 0)
    validator.submit(7); // wrong (attempt 1)
    const result = validator.submit(2); // correct

    expect(result.correct).toBe(true);
    expect(validator.getState().currentStepIndex).toBe(1);
    expect(validator.getState().currentAttempts).toBe(0);
    expect(validator.getState().totalIncorrectAttempts).toBe(2);
  });

  it("accumulates totalIncorrectAttempts across steps", () => {
    const solution = solve(84, 4);
    const validator = createStepValidator(solution);

    // Step 0: 2 wrong, then correct
    validator.submit(9);
    validator.submit(7);
    validator.submit(2); // correct

    // Step 1: 1 wrong, then correct
    validator.submit(3);
    validator.submit(8); // correct

    const state = validator.getState();
    expect(state.totalIncorrectAttempts).toBe(3);
    expect(state.currentStepIndex).toBe(2);
  });

  it("returns escalating hint attempt numbers on retries", () => {
    const solution = solve(84, 4);
    const validator = createStepValidator(solution);

    const r0 = validator.submit(9);
    expect(r0.hint!.attemptNumber).toBe(0);

    const r1 = validator.submit(7);
    expect(r1.hint!.attemptNumber).toBe(1);

    const r2 = validator.submit(3);
    expect(r2.hint!.attemptNumber).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// createStepValidator – reset
// ---------------------------------------------------------------------------

describe("createStepValidator – reset", () => {
  it("resets to initial state", () => {
    const solution = solve(84, 4);
    const validator = createStepValidator(solution);

    // Advance a few steps
    validator.submit(2); // correct
    validator.submit(8); // correct
    validator.submit(9); // wrong

    validator.reset();
    const state = validator.getState();
    expect(state.currentStepIndex).toBe(0);
    expect(state.currentAttempts).toBe(0);
    expect(state.isComplete).toBe(false);
    expect(state.totalIncorrectAttempts).toBe(0);
  });

  it("can be used again after reset", () => {
    const solution = solve(84, 4);
    const validator = createStepValidator(solution);

    // Complete the problem
    for (const step of solution.steps) {
      const expectedVal =
        step.kind === StepKind.BringDown
          ? step.digitBroughtDown
          : step.expectedValue;
      validator.submit(expectedVal);
    }

    expect(validator.getState().isComplete).toBe(true);

    validator.reset();
    expect(validator.getState().isComplete).toBe(false);

    // Should be able to submit again
    const result = validator.submit(2);
    expect(result.correct).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// createStepValidator – full problem walkthrough
// ---------------------------------------------------------------------------

describe("createStepValidator – full problem walkthrough", () => {
  it("walks through 84 ÷ 4 with mixed correct/incorrect", () => {
    const solution = solve(84, 4);
    const validator = createStepValidator(solution);

    // Step 0: Q=2
    let r = validator.submit(3); // wrong
    expect(r.correct).toBe(false);
    expect(r.hint).not.toBeNull();
    expect(r.nextStepIndex).toBe(0);

    r = validator.submit(2); // correct
    expect(r.correct).toBe(true);
    expect(r.hint).toBeNull();
    expect(r.nextStepIndex).toBe(1);

    // Step 1: M=8
    r = validator.submit(8);
    expect(r.correct).toBe(true);

    // Step 2: S=0
    r = validator.submit(0);
    expect(r.correct).toBe(true);

    // Step 3: BD digit=4
    r = validator.submit(4);
    expect(r.correct).toBe(true);

    // Step 4: Q=1
    r = validator.submit(1);
    expect(r.correct).toBe(true);

    // Step 5: M=4
    r = validator.submit(4);
    expect(r.correct).toBe(true);

    // Step 6: S=0 (last step)
    r = validator.submit(0);
    expect(r.correct).toBe(true);
    expect(r.isComplete).toBe(true);
    expect(r.nextStepIndex).toBeNull();

    expect(validator.getState().totalIncorrectAttempts).toBe(1);
  });

  it("walks through 532 ÷ 4 all correct", () => {
    const solution = solve(532, 4);
    const validator = createStepValidator(solution);

    // All expected values from the solution
    const expectedValues = solution.steps.map((step) =>
      step.kind === StepKind.BringDown
        ? step.digitBroughtDown
        : step.expectedValue,
    );

    for (let i = 0; i < expectedValues.length; i++) {
      const r = validator.submit(expectedValues[i]);
      expect(r.correct).toBe(true);
      if (i < expectedValues.length - 1) {
        expect(r.isComplete).toBe(false);
        expect(r.nextStepIndex).toBe(i + 1);
      } else {
        expect(r.isComplete).toBe(true);
        expect(r.nextStepIndex).toBeNull();
      }
    }
  });

  it("handles multi-digit divisor problem (156 ÷ 12)", () => {
    const solution = solve(156, 12);
    const validator = createStepValidator(solution);

    const expectedValues = solution.steps.map((step) =>
      step.kind === StepKind.BringDown
        ? step.digitBroughtDown
        : step.expectedValue,
    );

    for (const val of expectedValues) {
      const r = validator.submit(val);
      expect(r.correct).toBe(true);
    }

    expect(validator.getState().isComplete).toBe(true);
  });

  it("handles zero quotient digit (7035 ÷ 5)", () => {
    const solution = solve(7035, 5);
    const validator = createStepValidator(solution);

    const expectedValues = solution.steps.map((step) =>
      step.kind === StepKind.BringDown
        ? step.digitBroughtDown
        : step.expectedValue,
    );

    for (const val of expectedValues) {
      const r = validator.submit(val);
      expect(r.correct).toBe(true);
    }

    expect(validator.getState().isComplete).toBe(true);
    expect(validator.getState().totalIncorrectAttempts).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

describe("step-validator – module exports", () => {
  it("validateStep is exported from division-engine", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const engine = require("@/features/division-engine");
    expect(typeof engine.validateStep).toBe("function");
  });

  it("createStepValidator is exported from division-engine", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const engine = require("@/features/division-engine");
    expect(typeof engine.createStepValidator).toBe("function");
  });
});
