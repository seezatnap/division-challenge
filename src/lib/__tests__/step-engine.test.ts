import { describe, it, expect } from "vitest";
import {
  computeSteps,
  createStepEngine,
  getCurrentStep,
  submitAnswer,
  getProgress,
} from "../step-engine";
import type { DivisionProblem } from "@/types";
import { getDifficultyConfig } from "../difficulty";
import { generateProblem } from "../generate-problem";

// ─── Helpers ────────────────────────────────────────────────

/** Build a DivisionProblem from dividend and divisor for testing. */
function makeProblem(
  dividend: number,
  divisor: number,
): DivisionProblem {
  return {
    id: "test-problem",
    dividend,
    divisor,
    quotient: Math.floor(dividend / divisor),
    remainder: dividend % divisor,
    difficulty: getDifficultyConfig(1),
  };
}

/** Walk through all steps of an engine, submitting the correct answer each time. */
function solveCompletely(
  problem: DivisionProblem,
): { results: Array<{ correct: boolean; hint?: string }>; stepsCount: number } {
  const engine = createStepEngine(problem);
  const results: Array<{ correct: boolean; hint?: string }> = [];
  while (!engine.completed) {
    const step = getCurrentStep(engine);
    if (!step) break;
    const result = submitAnswer(engine, step.expected);
    if (!result) break;
    results.push(result);
  }
  return { results, stepsCount: engine.steps.length };
}

// ─── computeSteps ───────────────────────────────────────────

describe("computeSteps", () => {
  it("produces correct steps for a simple problem: 84 ÷ 4", () => {
    // 84 ÷ 4 = 21 R 0
    // Step-by-step on paper:
    //   8 ÷ 4 = 2, 2×4 = 8, 8-8 = 0
    //   Bring down 4 → 04
    //   4 ÷ 4 = 1, 1×4 = 4, 4-4 = 0
    const steps = computeSteps(makeProblem(84, 4));

    expect(steps).toEqual([
      { kind: "divide", expected: 2, prompt: "Divide 8 by 4" },
      { kind: "multiply", expected: 8, prompt: "Multiply 2 × 4" },
      { kind: "subtract", expected: 0, prompt: "Subtract 8 from 8" },
      { kind: "bring-down", expected: 4, prompt: "Bring down the 4 to get 4" },
      { kind: "divide", expected: 1, prompt: "Divide 4 by 4" },
      { kind: "multiply", expected: 4, prompt: "Multiply 1 × 4" },
      { kind: "subtract", expected: 0, prompt: "Subtract 4 from 4" },
    ]);
  });

  it("produces correct steps for a problem with remainder: 87 ÷ 4", () => {
    // 87 ÷ 4 = 21 R 3
    const steps = computeSteps(makeProblem(87, 4));

    expect(steps).toEqual([
      { kind: "divide", expected: 2, prompt: "Divide 8 by 4" },
      { kind: "multiply", expected: 8, prompt: "Multiply 2 × 4" },
      { kind: "subtract", expected: 0, prompt: "Subtract 8 from 8" },
      { kind: "bring-down", expected: 7, prompt: "Bring down the 7 to get 7" },
      { kind: "divide", expected: 1, prompt: "Divide 7 by 4" },
      { kind: "multiply", expected: 4, prompt: "Multiply 1 × 4" },
      { kind: "subtract", expected: 3, prompt: "Subtract 4 from 7" },
    ]);
  });

  it("handles leading digits smaller than divisor: 15 ÷ 5", () => {
    // 15 ÷ 5 = 3 R 0
    // First digit 1 < 5, so bring down 5 → 15
    const steps = computeSteps(makeProblem(15, 5));

    expect(steps).toEqual([
      { kind: "bring-down", expected: 5, prompt: "Bring down the 5 to get 15" },
      { kind: "divide", expected: 3, prompt: "Divide 15 by 5" },
      { kind: "multiply", expected: 15, prompt: "Multiply 3 × 5" },
      { kind: "subtract", expected: 0, prompt: "Subtract 15 from 15" },
    ]);
  });

  it("handles 3-digit ÷ 1-digit: 456 ÷ 7", () => {
    // 456 ÷ 7 = 65 R 1
    // 4 < 7, bring down 5 → 45
    // 45 ÷ 7 = 6, 6×7=42, 45-42=3
    // Bring down 6 → 36
    // 36 ÷ 7 = 5, 5×7=35, 36-35=1
    const steps = computeSteps(makeProblem(456, 7));

    expect(steps).toEqual([
      { kind: "bring-down", expected: 5, prompt: "Bring down the 5 to get 45" },
      { kind: "divide", expected: 6, prompt: "Divide 45 by 7" },
      { kind: "multiply", expected: 42, prompt: "Multiply 6 × 7" },
      { kind: "subtract", expected: 3, prompt: "Subtract 42 from 45" },
      { kind: "bring-down", expected: 6, prompt: "Bring down the 6 to get 36" },
      { kind: "divide", expected: 5, prompt: "Divide 36 by 7" },
      { kind: "multiply", expected: 35, prompt: "Multiply 5 × 7" },
      { kind: "subtract", expected: 1, prompt: "Subtract 35 from 36" },
    ]);
  });

  it("handles multi-digit divisor: 7856 ÷ 32", () => {
    // 7856 ÷ 32 = 245 R 16
    // 7 < 32, bring down 8 → 78
    // 78 ÷ 32 = 2, 2×32=64, 78-64=14
    // Bring down 5 → 145
    // 145 ÷ 32 = 4, 4×32=128, 145-128=17
    // Bring down 6 → 176
    // 176 ÷ 32 = 5, 5×32=160, 176-160=16
    const steps = computeSteps(makeProblem(7856, 32));

    expect(steps).toEqual([
      { kind: "bring-down", expected: 8, prompt: "Bring down the 8 to get 78" },
      { kind: "divide", expected: 2, prompt: "Divide 78 by 32" },
      { kind: "multiply", expected: 64, prompt: "Multiply 2 × 32" },
      { kind: "subtract", expected: 14, prompt: "Subtract 64 from 78" },
      { kind: "bring-down", expected: 5, prompt: "Bring down the 5 to get 145" },
      { kind: "divide", expected: 4, prompt: "Divide 145 by 32" },
      { kind: "multiply", expected: 128, prompt: "Multiply 4 × 32" },
      { kind: "subtract", expected: 17, prompt: "Subtract 128 from 145" },
      { kind: "bring-down", expected: 6, prompt: "Bring down the 6 to get 176" },
      { kind: "divide", expected: 5, prompt: "Divide 176 by 32" },
      { kind: "multiply", expected: 160, prompt: "Multiply 5 × 32" },
      { kind: "subtract", expected: 16, prompt: "Subtract 160 from 176" },
    ]);
  });

  it("handles zero quotient digit in the middle: 504 ÷ 5", () => {
    // 504 ÷ 5 = 100 R 4
    // 5 ÷ 5 = 1, 1×5=5, 5-5=0
    // Bring down 0 → 0
    // 0 ÷ 5 = 0, 0×5=0, 0-0=0
    // Bring down 4 → 4
    // 4 ÷ 5 = 0, 0×5=0, 4-0=4
    const steps = computeSteps(makeProblem(504, 5));

    expect(steps).toEqual([
      { kind: "divide", expected: 1, prompt: "Divide 5 by 5" },
      { kind: "multiply", expected: 5, prompt: "Multiply 1 × 5" },
      { kind: "subtract", expected: 0, prompt: "Subtract 5 from 5" },
      { kind: "bring-down", expected: 0, prompt: "Bring down the 0 to get 0" },
      { kind: "divide", expected: 0, prompt: "Divide 0 by 5" },
      { kind: "multiply", expected: 0, prompt: "Multiply 0 × 5" },
      { kind: "subtract", expected: 0, prompt: "Subtract 0 from 0" },
      { kind: "bring-down", expected: 4, prompt: "Bring down the 4 to get 4" },
      { kind: "divide", expected: 0, prompt: "Divide 4 by 5" },
      { kind: "multiply", expected: 0, prompt: "Multiply 0 × 5" },
      { kind: "subtract", expected: 4, prompt: "Subtract 0 from 4" },
    ]);
  });

  it("handles exact division: 96 ÷ 8", () => {
    // 96 ÷ 8 = 12 R 0
    const steps = computeSteps(makeProblem(96, 8));

    expect(steps).toEqual([
      { kind: "divide", expected: 1, prompt: "Divide 9 by 8" },
      { kind: "multiply", expected: 8, prompt: "Multiply 1 × 8" },
      { kind: "subtract", expected: 1, prompt: "Subtract 8 from 9" },
      { kind: "bring-down", expected: 6, prompt: "Bring down the 6 to get 16" },
      { kind: "divide", expected: 2, prompt: "Divide 16 by 8" },
      { kind: "multiply", expected: 16, prompt: "Multiply 2 × 8" },
      { kind: "subtract", expected: 0, prompt: "Subtract 16 from 16" },
    ]);
  });

  it("always ends with a subtract step", () => {
    const problems = [
      makeProblem(84, 4),
      makeProblem(15, 5),
      makeProblem(456, 7),
      makeProblem(7856, 32),
      makeProblem(504, 5),
    ];
    for (const p of problems) {
      const steps = computeSteps(p);
      expect(steps.length).toBeGreaterThan(0);
      expect(steps[steps.length - 1].kind).toBe("subtract");
    }
  });

  it("final subtract step expected value equals the remainder", () => {
    const problems = [
      makeProblem(84, 4),    // R0
      makeProblem(87, 4),    // R3
      makeProblem(456, 7),   // R1
      makeProblem(7856, 32), // R16
      makeProblem(504, 5),   // R4
    ];
    for (const p of problems) {
      const steps = computeSteps(p);
      const lastStep = steps[steps.length - 1];
      expect(lastStep.expected).toBe(p.remainder);
    }
  });
});

// ─── createStepEngine ───────────────────────────────────────

describe("createStepEngine", () => {
  it("initializes with step index 0 and not completed", () => {
    const engine = createStepEngine(makeProblem(84, 4));
    expect(engine.currentStepIndex).toBe(0);
    expect(engine.completed).toBe(false);
    expect(engine.steps.length).toBeGreaterThan(0);
    expect(engine.problem.dividend).toBe(84);
  });
});

// ─── getCurrentStep ─────────────────────────────────────────

describe("getCurrentStep", () => {
  it("returns the first step initially", () => {
    const engine = createStepEngine(makeProblem(84, 4));
    const step = getCurrentStep(engine);
    expect(step).not.toBeNull();
    expect(step!.kind).toBe("divide");
  });

  it("returns null when the problem is completed", () => {
    const engine = createStepEngine(makeProblem(84, 4));
    engine.completed = true;
    expect(getCurrentStep(engine)).toBeNull();
  });
});

// ─── submitAnswer ───────────────────────────────────────────

describe("submitAnswer", () => {
  it("returns correct: true and advances step on correct answer", () => {
    const engine = createStepEngine(makeProblem(84, 4));
    const firstStep = getCurrentStep(engine)!;
    expect(firstStep.expected).toBe(2); // Divide 8 by 4

    const result = submitAnswer(engine, 2);
    expect(result).toEqual({ correct: true });
    expect(engine.currentStepIndex).toBe(1);
  });

  it("returns correct: false with a hint on wrong answer", () => {
    const engine = createStepEngine(makeProblem(84, 4));

    const result = submitAnswer(engine, 3);
    expect(result).not.toBeNull();
    expect(result!.correct).toBe(false);
    expect(result!.hint).toBeDefined();
    expect(result!.hint!.length).toBeGreaterThan(0);
    // Step index should NOT advance
    expect(engine.currentStepIndex).toBe(0);
  });

  it("does not advance on incorrect answer — player can retry", () => {
    const engine = createStepEngine(makeProblem(84, 4));

    submitAnswer(engine, 99);
    submitAnswer(engine, 99);
    expect(engine.currentStepIndex).toBe(0);

    // Now give the correct answer
    submitAnswer(engine, 2);
    expect(engine.currentStepIndex).toBe(1);
  });

  it("marks completed after all correct answers", () => {
    const problem = makeProblem(84, 4);
    const engine = createStepEngine(problem);

    for (const step of engine.steps) {
      expect(engine.completed).toBe(false);
      submitAnswer(engine, step.expected);
    }
    expect(engine.completed).toBe(true);
  });

  it("returns null when problem is already completed", () => {
    const problem = makeProblem(84, 4);
    const engine = createStepEngine(problem);
    // Solve completely
    for (const step of engine.steps) {
      submitAnswer(engine, step.expected);
    }
    expect(submitAnswer(engine, 0)).toBeNull();
  });

  it("provides hints with different text per step kind", () => {
    const engine = createStepEngine(makeProblem(84, 4));

    // Wrong answer on a divide step
    const divideResult = submitAnswer(engine, 99);
    expect(divideResult!.hint).toContain("Divide");

    // Advance to multiply step
    submitAnswer(engine, 2); // correct divide
    const multiplyResult = submitAnswer(engine, 99);
    expect(multiplyResult!.hint).toContain("multiplication");

    // Advance to subtract step
    submitAnswer(engine, 8); // correct multiply
    const subtractResult = submitAnswer(engine, 99);
    expect(subtractResult!.hint).toContain("subtraction");

    // Advance to bring-down step
    submitAnswer(engine, 0); // correct subtract
    const bringDownResult = submitAnswer(engine, 99);
    expect(bringDownResult!.hint).toContain("next digit");
  });
});

// ─── getProgress ────────────────────────────────────────────

describe("getProgress", () => {
  it("reports initial progress correctly", () => {
    const engine = createStepEngine(makeProblem(84, 4));
    const progress = getProgress(engine);

    expect(progress.totalSteps).toBe(7);
    expect(progress.completedSteps).toBe(0);
    expect(progress.currentStepKind).toBe("divide");
    expect(progress.isComplete).toBe(false);
  });

  it("reports progress mid-problem", () => {
    const engine = createStepEngine(makeProblem(84, 4));
    submitAnswer(engine, 2); // divide
    submitAnswer(engine, 8); // multiply

    const progress = getProgress(engine);
    expect(progress.completedSteps).toBe(2);
    expect(progress.currentStepKind).toBe("subtract");
    expect(progress.isComplete).toBe(false);
  });

  it("reports completion", () => {
    const problem = makeProblem(84, 4);
    const engine = createStepEngine(problem);
    for (const step of engine.steps) {
      submitAnswer(engine, step.expected);
    }

    const progress = getProgress(engine);
    expect(progress.completedSteps).toBe(progress.totalSteps);
    expect(progress.currentStepKind).toBeNull();
    expect(progress.isComplete).toBe(true);
  });
});

// ─── Full-problem walkthroughs ──────────────────────────────

describe("full-problem walkthroughs", () => {
  it("solves 84 ÷ 4 correctly through engine", () => {
    const { results, stepsCount } = solveCompletely(makeProblem(84, 4));
    expect(results).toHaveLength(stepsCount);
    expect(results.every((r) => r.correct)).toBe(true);
  });

  it("solves 87 ÷ 4 correctly through engine", () => {
    const { results, stepsCount } = solveCompletely(makeProblem(87, 4));
    expect(results).toHaveLength(stepsCount);
    expect(results.every((r) => r.correct)).toBe(true);
  });

  it("solves 456 ÷ 7 correctly through engine", () => {
    const { results, stepsCount } = solveCompletely(makeProblem(456, 7));
    expect(results).toHaveLength(stepsCount);
    expect(results.every((r) => r.correct)).toBe(true);
  });

  it("solves 7856 ÷ 32 correctly through engine", () => {
    const { results, stepsCount } = solveCompletely(makeProblem(7856, 32));
    expect(results).toHaveLength(stepsCount);
    expect(results.every((r) => r.correct)).toBe(true);
  });

  it("solves 504 ÷ 5 correctly through engine", () => {
    const { results, stepsCount } = solveCompletely(makeProblem(504, 5));
    expect(results).toHaveLength(stepsCount);
    expect(results.every((r) => r.correct)).toBe(true);
  });

  it("solves 15 ÷ 5 correctly through engine", () => {
    const { results, stepsCount } = solveCompletely(makeProblem(15, 5));
    expect(results).toHaveLength(stepsCount);
    expect(results.every((r) => r.correct)).toBe(true);
  });

  it("solves random generated problems from all tiers", () => {
    // Test with actual generated problems to ensure integration works
    for (let tier = 1; tier <= 5; tier++) {
      for (let i = 0; i < 5; i++) {
        const problem = generateProblem(tier as 1 | 2 | 3 | 4 | 5);
        const { results, stepsCount } = solveCompletely(problem);
        expect(results).toHaveLength(stepsCount);
        expect(results.every((r) => r.correct)).toBe(true);
      }
    }
  });
});

// ─── Edge cases ─────────────────────────────────────────────

describe("edge cases", () => {
  it("handles single-digit quotient: 12 ÷ 4", () => {
    // 12 ÷ 4 = 3 R 0
    // 1 < 4, bring down 2 → 12
    // 12 ÷ 4 = 3, 3×4=12, 12-12=0
    const steps = computeSteps(makeProblem(12, 4));
    expect(steps[0]).toEqual({
      kind: "bring-down",
      expected: 2,
      prompt: "Bring down the 2 to get 12",
    });
    expect(steps[1]).toEqual({
      kind: "divide",
      expected: 3,
      prompt: "Divide 12 by 4",
    });

    const { results } = solveCompletely(makeProblem(12, 4));
    expect(results.every((r) => r.correct)).toBe(true);
  });

  it("handles dividend equal to divisor: 7 ÷ 7", () => {
    // 7 ÷ 7 = 1 R 0
    const steps = computeSteps(makeProblem(7, 7));
    expect(steps).toEqual([
      { kind: "divide", expected: 1, prompt: "Divide 7 by 7" },
      { kind: "multiply", expected: 7, prompt: "Multiply 1 × 7" },
      { kind: "subtract", expected: 0, prompt: "Subtract 7 from 7" },
    ]);
  });

  it("handles large problem: 99999 ÷ 100", () => {
    // 99999 ÷ 100 = 999 R 99
    const problem = makeProblem(99999, 100);
    expect(problem.quotient).toBe(999);
    expect(problem.remainder).toBe(99);

    const { results } = solveCompletely(problem);
    expect(results.every((r) => r.correct)).toBe(true);

    const steps = computeSteps(problem);
    const lastStep = steps[steps.length - 1];
    expect(lastStep.expected).toBe(99);
  });

  it("handles quotient with zeros: 1000 ÷ 5", () => {
    // 1000 ÷ 5 = 200 R 0
    const problem = makeProblem(1000, 5);
    expect(problem.quotient).toBe(200);
    expect(problem.remainder).toBe(0);

    const { results } = solveCompletely(problem);
    expect(results.every((r) => r.correct)).toBe(true);
  });
});
