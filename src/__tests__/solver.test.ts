import { DifficultyLevel, StepKind } from "@/types";
import type {
  DivisionProblem,
  DivisionStep,
  QuotientDigitStep,
  MultiplyStep,
  SubtractStep,
  BringDownStep,
} from "@/types";
import { solveDivisionProblem } from "@/features/division-engine/solver";
import { generateProblem } from "@/features/division-engine/problem-generator";

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

function stepsOfKind(steps: DivisionStep[], kind: StepKind): DivisionStep[] {
  return steps.filter((s) => s.kind === kind);
}

// ---------------------------------------------------------------------------
// Hand-verified examples
// ---------------------------------------------------------------------------

describe("solveDivisionProblem – hand-verified examples", () => {
  it("84 ÷ 4 = 21 (exact, 2-digit ÷ 1-digit)", () => {
    const solution = solveDivisionProblem(makeProblem(84, 4));
    const { steps } = solution;

    // Expected workflow:
    //        21
    //   4 ) 84
    //       -8     (4×2=8)
    //       --
    //        04    (8-8=0, bring down 4 → 4)
    //        -4    (4×1=4)
    //        --
    //         0    (4-4=0)

    // Step 0: quotient digit 2 at position 0
    expect(steps[0]).toEqual({
      kind: StepKind.QuotientDigit,
      index: 0,
      digitPosition: 0,
      expectedValue: 2,
    });
    // Step 1: multiply 4×2 = 8
    expect(steps[1]).toEqual({
      kind: StepKind.Multiply,
      index: 1,
      digitPosition: 0,
      expectedValue: 8,
    });
    // Step 2: subtract 8 - 8 = 0
    expect(steps[2]).toEqual({
      kind: StepKind.Subtract,
      index: 2,
      digitPosition: 0,
      expectedValue: 0,
    });
    // Step 3: bring down 4, new working number = 04 = 4
    expect(steps[3]).toEqual({
      kind: StepKind.BringDown,
      index: 3,
      digitPosition: 1,
      digitBroughtDown: 4,
      newWorkingNumber: 4,
    });
    // Step 4: quotient digit 1 at position 1
    expect(steps[4]).toEqual({
      kind: StepKind.QuotientDigit,
      index: 4,
      digitPosition: 1,
      expectedValue: 1,
    });
    // Step 5: multiply 4×1 = 4
    expect(steps[5]).toEqual({
      kind: StepKind.Multiply,
      index: 5,
      digitPosition: 1,
      expectedValue: 4,
    });
    // Step 6: subtract 4 - 4 = 0
    expect(steps[6]).toEqual({
      kind: StepKind.Subtract,
      index: 6,
      digitPosition: 1,
      expectedValue: 0,
    });

    expect(steps).toHaveLength(7);
  });

  it("532 ÷ 4 = 133 (exact, 3-digit ÷ 1-digit)", () => {
    const solution = solveDivisionProblem(makeProblem(532, 4));
    const { steps } = solution;

    //        133
    //   4 ) 532
    //       -4     → 5-4=1, bring 3 → 13
    //        13
    //       -12    → 13-12=1, bring 2 → 12
    //         12
    //        -12   → 12-12=0
    //          0

    // Round 1: Q(0), M(1), S(2), BD(3)
    // Round 2: Q(4), M(5), S(6), BD(7)
    // Round 3: Q(8), M(9), S(10)
    expect(steps).toHaveLength(11);

    // First round: 5 ÷ 4
    expect(steps[0]).toMatchObject({ kind: StepKind.QuotientDigit, expectedValue: 1 });
    expect(steps[1]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 4 });
    expect(steps[2]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 1 });
    expect(steps[3]).toMatchObject({
      kind: StepKind.BringDown,
      digitBroughtDown: 3,
      newWorkingNumber: 13,
    });

    // Second round: 13 ÷ 4
    expect(steps[4]).toMatchObject({ kind: StepKind.QuotientDigit, expectedValue: 3 });
    expect(steps[5]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 12 });
    expect(steps[6]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 1 });
    expect(steps[7]).toMatchObject({
      kind: StepKind.BringDown,
      digitBroughtDown: 2,
      newWorkingNumber: 12,
    });

    // Third round: 12 ÷ 4
    expect(steps[8]).toMatchObject({ kind: StepKind.QuotientDigit, expectedValue: 3 });
    expect(steps[9]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 12 });
    expect(steps[10]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 0 });
  });

  it("85 ÷ 4 = 21 R1 (with remainder)", () => {
    const solution = solveDivisionProblem(makeProblem(85, 4));
    const { steps } = solution;

    //        21
    //   4 ) 85
    //       -8    (4×2=8)
    //       --
    //        05   (8-8=0, bring 5 → 5)
    //        -4   (4×1=4)
    //        --
    //         1   (5-4=1 = remainder)

    expect(steps).toHaveLength(7);
    expect(steps[0]).toMatchObject({ kind: StepKind.QuotientDigit, expectedValue: 2 });
    expect(steps[1]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 8 });
    expect(steps[2]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 0 });
    expect(steps[3]).toMatchObject({
      kind: StepKind.BringDown,
      digitBroughtDown: 5,
      newWorkingNumber: 5,
    });
    expect(steps[4]).toMatchObject({ kind: StepKind.QuotientDigit, expectedValue: 1 });
    expect(steps[5]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 4 });
    expect(steps[6]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 1 });
  });

  it("156 ÷ 12 = 13 (multi-digit divisor, exact)", () => {
    const solution = solveDivisionProblem(makeProblem(156, 12));
    const { steps } = solution;

    //        13
    //  12 ) 156
    //       -12   (12×1=12)
    //       ---
    //        36   (15-12=3, bring 6 → 36)
    //       -36   (12×3=36)
    //       ---
    //         0

    expect(steps).toHaveLength(7);
    // First round: 15 ÷ 12
    expect(steps[0]).toMatchObject({
      kind: StepKind.QuotientDigit,
      digitPosition: 1,
      expectedValue: 1,
    });
    expect(steps[1]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 12 });
    expect(steps[2]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 3 });
    expect(steps[3]).toMatchObject({
      kind: StepKind.BringDown,
      digitPosition: 2,
      digitBroughtDown: 6,
      newWorkingNumber: 36,
    });

    // Second round: 36 ÷ 12
    expect(steps[4]).toMatchObject({
      kind: StepKind.QuotientDigit,
      digitPosition: 2,
      expectedValue: 3,
    });
    expect(steps[5]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 36 });
    expect(steps[6]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 0 });
  });

  it("7035 ÷ 5 = 1407 (quotient with zero digit)", () => {
    const solution = solveDivisionProblem(makeProblem(7035, 5));
    const { steps } = solution;

    //        1407
    //   5 ) 7035
    //       -5      (5×1=5)
    //       --
    //        20     (7-5=2, bring 0 → 20)
    //       -20     (5×4=20)
    //       ---
    //         03    (20-20=0, bring 3 → 3)
    //         -0    (5×0=0)
    //         --
    //          35   (3-0=3, bring 5 → 35)
    //         -35   (5×7=35)
    //         ---
    //           0

    // Round 1: Q,M,S,BD = 4
    // Round 2: Q,M,S,BD = 4
    // Round 3: Q,M,S,BD = 4
    // Round 4: Q,M,S = 3
    expect(steps).toHaveLength(15);

    // Round 1: 7 ÷ 5
    expect(steps[0]).toMatchObject({ kind: StepKind.QuotientDigit, expectedValue: 1, digitPosition: 0 });
    expect(steps[1]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 5 });
    expect(steps[2]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 2 });
    expect(steps[3]).toMatchObject({
      kind: StepKind.BringDown,
      digitBroughtDown: 0,
      newWorkingNumber: 20,
    });

    // Round 2: 20 ÷ 5
    expect(steps[4]).toMatchObject({ kind: StepKind.QuotientDigit, expectedValue: 4 });
    expect(steps[5]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 20 });
    expect(steps[6]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 0 });
    expect(steps[7]).toMatchObject({
      kind: StepKind.BringDown,
      digitBroughtDown: 3,
      newWorkingNumber: 3,
    });

    // Round 3: 3 ÷ 5 = 0 (zero quotient digit!)
    expect(steps[8]).toMatchObject({ kind: StepKind.QuotientDigit, expectedValue: 0 });
    expect(steps[9]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 0 });
    expect(steps[10]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 3 });
    expect(steps[11]).toMatchObject({
      kind: StepKind.BringDown,
      digitBroughtDown: 5,
      newWorkingNumber: 35,
    });

    // Round 4: 35 ÷ 5
    expect(steps[12]).toMatchObject({ kind: StepKind.QuotientDigit, expectedValue: 7 });
    expect(steps[13]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 35 });
    expect(steps[14]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 0 });
  });

  it("100 ÷ 4 = 25 (dividend with trailing zeros)", () => {
    const solution = solveDivisionProblem(makeProblem(100, 4));
    const { steps } = solution;

    //        25
    //   4 ) 100
    //       -8    (4×2=8)
    //       --
    //        20   (10-8=2, bring 0 → 20)
    //       -20   (4×5=20)
    //       ---
    //         0

    expect(steps).toHaveLength(7);
    // Round 1: 10 ÷ 4 (needs first two digits since 1 < 4)
    expect(steps[0]).toMatchObject({
      kind: StepKind.QuotientDigit,
      digitPosition: 1,
      expectedValue: 2,
    });
    expect(steps[1]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 8 });
    expect(steps[2]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 2 });
    expect(steps[3]).toMatchObject({
      kind: StepKind.BringDown,
      digitBroughtDown: 0,
      newWorkingNumber: 20,
    });

    // Round 2: 20 ÷ 4
    expect(steps[4]).toMatchObject({ kind: StepKind.QuotientDigit, expectedValue: 5 });
    expect(steps[5]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 20 });
    expect(steps[6]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 0 });
  });

  it("10000 ÷ 100 = 100 (multi-digit divisor, large dividend)", () => {
    const solution = solveDivisionProblem(makeProblem(10000, 100));
    const { steps } = solution;

    //         100
    //  100 ) 10000
    //        -100   (100×1=100)
    //        ----
    //          000  (100-100=0, bring 0 → 0)
    //          -0   (100×0=0)
    //          --
    //           00  (0-0=0, bring 0 → 0)
    //           -0  (100×0=0)
    //           --
    //            0

    expect(steps).toHaveLength(11);
    // Round 1: 100 ÷ 100 (uses first 3 digits)
    expect(steps[0]).toMatchObject({
      kind: StepKind.QuotientDigit,
      digitPosition: 2,
      expectedValue: 1,
    });
    expect(steps[1]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 100 });
    expect(steps[2]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 0 });
    expect(steps[3]).toMatchObject({
      kind: StepKind.BringDown,
      digitBroughtDown: 0,
      newWorkingNumber: 0,
    });

    // Round 2: 0 ÷ 100 = 0
    expect(steps[4]).toMatchObject({ kind: StepKind.QuotientDigit, expectedValue: 0 });
    expect(steps[5]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 0 });
    expect(steps[6]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 0 });
    expect(steps[7]).toMatchObject({
      kind: StepKind.BringDown,
      digitBroughtDown: 0,
      newWorkingNumber: 0,
    });

    // Round 3: 0 ÷ 100 = 0
    expect(steps[8]).toMatchObject({ kind: StepKind.QuotientDigit, expectedValue: 0 });
    expect(steps[9]).toMatchObject({ kind: StepKind.Multiply, expectedValue: 0 });
    expect(steps[10]).toMatchObject({ kind: StepKind.Subtract, expectedValue: 0 });
  });
});

// ---------------------------------------------------------------------------
// Step ordering invariants
// ---------------------------------------------------------------------------

describe("solveDivisionProblem – step ordering", () => {
  it("steps have sequential index values starting from 0", () => {
    const solution = solveDivisionProblem(makeProblem(532, 4));
    solution.steps.forEach((step, i) => {
      expect(step.index).toBe(i);
    });
  });

  it("follows Q-M-S(-BD) pattern for each round", () => {
    const solution = solveDivisionProblem(makeProblem(7035, 5));
    const { steps } = solution;

    let i = 0;
    while (i < steps.length) {
      expect(steps[i].kind).toBe(StepKind.QuotientDigit);
      expect(steps[i + 1].kind).toBe(StepKind.Multiply);
      expect(steps[i + 2].kind).toBe(StepKind.Subtract);
      if (i + 3 < steps.length) {
        expect(steps[i + 3].kind).toBe(StepKind.BringDown);
        i += 4;
      } else {
        i += 3;
      }
    }
  });

  it("last step is always a Subtract (no trailing BringDown)", () => {
    const problems = [
      makeProblem(84, 4),
      makeProblem(532, 4),
      makeProblem(85, 4),
      makeProblem(156, 12),
      makeProblem(7035, 5),
    ];
    for (const p of problems) {
      const { steps } = solveDivisionProblem(p);
      expect(steps[steps.length - 1].kind).toBe(StepKind.Subtract);
    }
  });

  it("number of quotient-digit steps equals number of digits in the quotient", () => {
    const problems = [
      makeProblem(84, 4),    // quotient=21  → 2 digits
      makeProblem(532, 4),   // quotient=133 → 3 digits
      makeProblem(7035, 5),  // quotient=1407 → 4 digits
      makeProblem(156, 12),  // quotient=13  → 2 digits
    ];
    for (const p of problems) {
      const { steps } = solveDivisionProblem(p);
      const qSteps = stepsOfKind(steps, StepKind.QuotientDigit);
      const expectedDigits = String(p.quotient).length;
      expect(qSteps.length).toBe(expectedDigits);
    }
  });

  it("quotient digits concatenated equal the full quotient", () => {
    const problems = [
      makeProblem(84, 4),
      makeProblem(532, 4),
      makeProblem(7035, 5),
      makeProblem(156, 12),
      makeProblem(85, 4),
    ];
    for (const p of problems) {
      const { steps } = solveDivisionProblem(p);
      const qDigits = stepsOfKind(steps, StepKind.QuotientDigit) as QuotientDigitStep[];
      const assembled = Number(qDigits.map((s) => s.expectedValue).join(""));
      expect(assembled).toBe(p.quotient);
    }
  });

  it("final subtract value equals the remainder", () => {
    const problems = [
      makeProblem(84, 4),    // remainder=0
      makeProblem(85, 4),    // remainder=1
      makeProblem(532, 4),   // remainder=0
      makeProblem(157, 12),  // remainder=1
    ];
    for (const p of problems) {
      const { steps } = solveDivisionProblem(p);
      const lastSubtract = steps[steps.length - 1] as SubtractStep;
      expect(lastSubtract.kind).toBe(StepKind.Subtract);
      expect(lastSubtract.expectedValue).toBe(p.remainder);
    }
  });
});

// ---------------------------------------------------------------------------
// Step value correctness
// ---------------------------------------------------------------------------

describe("solveDivisionProblem – step value correctness", () => {
  it("every multiply value equals divisor × preceding quotient digit", () => {
    const solution = solveDivisionProblem(makeProblem(7035, 5));
    const { steps } = solution;

    for (let i = 0; i < steps.length; i++) {
      if (steps[i].kind === StepKind.Multiply) {
        const prev = steps[i - 1] as QuotientDigitStep;
        expect(prev.kind).toBe(StepKind.QuotientDigit);
        expect((steps[i] as MultiplyStep).expectedValue).toBe(
          solution.problem.divisor * prev.expectedValue,
        );
      }
    }
  });

  it("every subtract value equals the working number minus the multiply product", () => {
    // For this we need to trace the working number through the steps.
    const problem = makeProblem(7035, 5);
    const { steps } = solveDivisionProblem(problem);
    const digits = String(problem.dividend).split("").map(Number);

    // Reconstruct working number at each subtraction
    let workingNumber = 0;
    let pos = 0;
    while (pos < digits.length && workingNumber < problem.divisor) {
      workingNumber = workingNumber * 10 + digits[pos];
      pos++;
    }

    for (let i = 0; i < steps.length; i++) {
      if (steps[i].kind === StepKind.Subtract) {
        const multiplyStep = steps[i - 1] as MultiplyStep;
        expect((steps[i] as SubtractStep).expectedValue).toBe(
          workingNumber - multiplyStep.expectedValue,
        );
      }
      if (steps[i].kind === StepKind.BringDown) {
        const bd = steps[i] as BringDownStep;
        workingNumber = bd.newWorkingNumber;
      }
      if (steps[i].kind === StepKind.QuotientDigit && i > 0) {
        // After a bring-down, the working number is already updated
      }
    }
  });

  it("bring-down newWorkingNumber equals (previous remainder × 10) + digit brought down", () => {
    const problem = makeProblem(532, 4);
    const { steps } = solveDivisionProblem(problem);

    for (let i = 0; i < steps.length; i++) {
      if (steps[i].kind === StepKind.BringDown) {
        const bd = steps[i] as BringDownStep;
        const prevSubtract = steps[i - 1] as SubtractStep;
        expect(prevSubtract.kind).toBe(StepKind.Subtract);
        expect(bd.newWorkingNumber).toBe(
          prevSubtract.expectedValue * 10 + bd.digitBroughtDown,
        );
      }
    }
  });
});

// ---------------------------------------------------------------------------
// digitPosition tracking
// ---------------------------------------------------------------------------

describe("solveDivisionProblem – digitPosition tracking", () => {
  it("digitPositions are non-decreasing across steps", () => {
    const solution = solveDivisionProblem(makeProblem(7035, 5));
    for (let i = 1; i < solution.steps.length; i++) {
      expect(solution.steps[i].digitPosition).toBeGreaterThanOrEqual(
        solution.steps[i - 1].digitPosition,
      );
    }
  });

  it("bring-down digitPosition points to the next dividend digit", () => {
    const problem = makeProblem(532, 4);
    const { steps } = solveDivisionProblem(problem);
    const bringDowns = stepsOfKind(steps, StepKind.BringDown) as BringDownStep[];

    // For 532: bring down digit at position 1 (digit '3'), then position 2 (digit '2')
    expect(bringDowns[0].digitPosition).toBe(1);
    expect(bringDowns[0].digitBroughtDown).toBe(3);
    expect(bringDowns[1].digitPosition).toBe(2);
    expect(bringDowns[1].digitBroughtDown).toBe(2);
  });

  it("first digitPosition equals divisor digit count minus one for multi-digit divisors", () => {
    // For 156 ÷ 12: initial working number uses positions 0 and 1 (digits 1,5)
    // so first digitPosition should be 1
    const solution = solveDivisionProblem(makeProblem(156, 12));
    expect(solution.steps[0].digitPosition).toBe(1);

    // For 10000 ÷ 100: initial working number uses positions 0,1,2 (digits 1,0,0)
    // so first digitPosition should be 2
    const solution2 = solveDivisionProblem(makeProblem(10000, 100));
    expect(solution2.steps[0].digitPosition).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Return value structure
// ---------------------------------------------------------------------------

describe("solveDivisionProblem – return value structure", () => {
  it("returns a DivisionSolution with problem and steps", () => {
    const problem = makeProblem(84, 4);
    const solution = solveDivisionProblem(problem);
    expect(solution.problem).toBe(problem);
    expect(Array.isArray(solution.steps)).toBe(true);
    expect(solution.steps.length).toBeGreaterThan(0);
  });

  it("every step has a valid kind from StepKind enum", () => {
    const solution = solveDivisionProblem(makeProblem(532, 4));
    const validKinds = new Set(Object.values(StepKind));
    for (const step of solution.steps) {
      expect(validKinds.has(step.kind)).toBe(true);
    }
  });

  it("QuotientDigit steps have expectedValue 0–9", () => {
    const solution = solveDivisionProblem(makeProblem(7035, 5));
    const qSteps = stepsOfKind(solution.steps, StepKind.QuotientDigit) as QuotientDigitStep[];
    for (const s of qSteps) {
      expect(s.expectedValue).toBeGreaterThanOrEqual(0);
      expect(s.expectedValue).toBeLessThanOrEqual(9);
    }
  });

  it("Multiply steps have non-negative expectedValue", () => {
    const solution = solveDivisionProblem(makeProblem(7035, 5));
    const mSteps = stepsOfKind(solution.steps, StepKind.Multiply) as MultiplyStep[];
    for (const s of mSteps) {
      expect(s.expectedValue).toBeGreaterThanOrEqual(0);
    }
  });

  it("Subtract steps have non-negative expectedValue", () => {
    const solution = solveDivisionProblem(makeProblem(7035, 5));
    const sSteps = stepsOfKind(solution.steps, StepKind.Subtract) as SubtractStep[];
    for (const s of sSteps) {
      expect(s.expectedValue).toBeGreaterThanOrEqual(0);
    }
  });

  it("BringDown steps have digitBroughtDown 0–9", () => {
    const solution = solveDivisionProblem(makeProblem(7035, 5));
    const bdSteps = stepsOfKind(solution.steps, StepKind.BringDown) as BringDownStep[];
    for (const s of bdSteps) {
      expect(s.digitBroughtDown).toBeGreaterThanOrEqual(0);
      expect(s.digitBroughtDown).toBeLessThanOrEqual(9);
    }
  });

  it("BringDown steps have non-negative newWorkingNumber", () => {
    const solution = solveDivisionProblem(makeProblem(7035, 5));
    const bdSteps = stepsOfKind(solution.steps, StepKind.BringDown) as BringDownStep[];
    for (const s of bdSteps) {
      expect(s.newWorkingNumber).toBeGreaterThanOrEqual(0);
    }
  });
});

// ---------------------------------------------------------------------------
// Integration with problem generator (randomized)
// ---------------------------------------------------------------------------

describe("solveDivisionProblem – integration with problem generator", () => {
  const ALL_LEVELS = Object.values(DifficultyLevel);

  it.each(ALL_LEVELS)(
    "%s: quotient digits concatenated match problem.quotient for 50 random problems",
    (level) => {
      for (let i = 0; i < 50; i++) {
        const problem = generateProblem({ difficulty: level });
        const { steps } = solveDivisionProblem(problem);
        const qDigits = stepsOfKind(steps, StepKind.QuotientDigit) as QuotientDigitStep[];
        const assembled = Number(qDigits.map((s) => s.expectedValue).join(""));
        expect(assembled).toBe(problem.quotient);
      }
    },
  );

  it.each(ALL_LEVELS)(
    "%s: final subtract equals problem.remainder for 50 random problems",
    (level) => {
      for (let i = 0; i < 50; i++) {
        const problem = generateProblem({ difficulty: level });
        const { steps } = solveDivisionProblem(problem);
        const lastStep = steps[steps.length - 1] as SubtractStep;
        expect(lastStep.kind).toBe(StepKind.Subtract);
        expect(lastStep.expectedValue).toBe(problem.remainder);
      }
    },
  );

  it.each(ALL_LEVELS)(
    "%s: step ordering follows Q-M-S(-BD) pattern for 20 random problems",
    (level) => {
      for (let iter = 0; iter < 20; iter++) {
        const problem = generateProblem({ difficulty: level });
        const { steps } = solveDivisionProblem(problem);

        let i = 0;
        while (i < steps.length) {
          expect(steps[i].kind).toBe(StepKind.QuotientDigit);
          expect(steps[i + 1].kind).toBe(StepKind.Multiply);
          expect(steps[i + 2].kind).toBe(StepKind.Subtract);
          if (i + 3 < steps.length) {
            expect(steps[i + 3].kind).toBe(StepKind.BringDown);
            i += 4;
          } else {
            i += 3;
          }
        }
      }
    },
  );

  it.each(ALL_LEVELS)(
    "%s: every multiply = divisor × preceding quotient digit for 20 random problems",
    (level) => {
      for (let iter = 0; iter < 20; iter++) {
        const problem = generateProblem({ difficulty: level });
        const { steps } = solveDivisionProblem(problem);

        for (let i = 0; i < steps.length; i++) {
          if (steps[i].kind === StepKind.Multiply) {
            const prev = steps[i - 1] as QuotientDigitStep;
            expect((steps[i] as MultiplyStep).expectedValue).toBe(
              problem.divisor * prev.expectedValue,
            );
          }
        }
      }
    },
  );

  it.each(ALL_LEVELS)(
    "%s: bring-down newWorkingNumber = prevRemainder*10 + digit for 20 random problems",
    (level) => {
      for (let iter = 0; iter < 20; iter++) {
        const problem = generateProblem({ difficulty: level });
        const { steps } = solveDivisionProblem(problem);

        for (let i = 0; i < steps.length; i++) {
          if (steps[i].kind === StepKind.BringDown) {
            const bd = steps[i] as BringDownStep;
            const prevSubtract = steps[i - 1] as SubtractStep;
            expect(bd.newWorkingNumber).toBe(
              prevSubtract.expectedValue * 10 + bd.digitBroughtDown,
            );
          }
        }
      }
    },
  );
});

// ---------------------------------------------------------------------------
// Export from division-engine
// ---------------------------------------------------------------------------

describe("solveDivisionProblem – module export", () => {
  it("is exported from @/features/division-engine", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const engine = require("@/features/division-engine");
    expect(typeof engine.solveDivisionProblem).toBe("function");
  });
});
