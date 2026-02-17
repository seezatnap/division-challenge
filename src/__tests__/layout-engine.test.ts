import { DifficultyLevel } from "@/types";
import type { DivisionProblem, DivisionSolution } from "@/types";
import { solveDivisionProblem } from "@/features/division-engine/solver";
import {
  computeLayout,
  type GridCell,
  type WorkspaceLayout,
} from "@/features/workspace-ui/layout-engine";

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

function cellsOfRole(layout: WorkspaceLayout, role: string): GridCell[] {
  return layout.cells.filter((c) => c.role === role);
}

function cellValues(cells: GridCell[]): string {
  return cells.map((c) => c.value).join("");
}

// ---------------------------------------------------------------------------
// Basic structure
// ---------------------------------------------------------------------------

describe("computeLayout – basic structure", () => {
  it("returns a WorkspaceLayout with required fields", () => {
    const layout = computeLayout(solve(84, 4));
    expect(layout).toHaveProperty("cells");
    expect(layout).toHaveProperty("separators");
    expect(layout).toHaveProperty("totalCols");
    expect(layout).toHaveProperty("totalRows");
    expect(layout).toHaveProperty("divisorText");
    expect(layout).toHaveProperty("hasRemainder");
  });

  it("totalCols equals number of dividend digits", () => {
    expect(computeLayout(solve(84, 4)).totalCols).toBe(2);
    expect(computeLayout(solve(532, 4)).totalCols).toBe(3);
    expect(computeLayout(solve(7035, 5)).totalCols).toBe(4);
    expect(computeLayout(solve(10000, 100)).totalCols).toBe(5);
  });

  it("divisorText matches the divisor", () => {
    expect(computeLayout(solve(84, 4)).divisorText).toBe("4");
    expect(computeLayout(solve(156, 12)).divisorText).toBe("12");
    expect(computeLayout(solve(10000, 100)).divisorText).toBe("100");
  });

  it("hasRemainder is false for exact division", () => {
    expect(computeLayout(solve(84, 4)).hasRemainder).toBe(false);
    expect(computeLayout(solve(532, 4)).hasRemainder).toBe(false);
  });

  it("hasRemainder is true for division with remainder", () => {
    expect(computeLayout(solve(85, 4)).hasRemainder).toBe(true);
    expect(computeLayout(solve(157, 12)).hasRemainder).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Dividend row
// ---------------------------------------------------------------------------

describe("computeLayout – dividend row", () => {
  it("places all dividend digits in row 1", () => {
    const layout = computeLayout(solve(532, 4));
    const dividendCells = cellsOfRole(layout, "dividend");
    expect(dividendCells).toHaveLength(3);
    expect(dividendCells.every((c) => c.row === 1)).toBe(true);
  });

  it("dividend digits are at sequential columns starting from 0", () => {
    const layout = computeLayout(solve(7035, 5));
    const dividendCells = cellsOfRole(layout, "dividend");
    expect(dividendCells.map((c) => c.col)).toEqual([0, 1, 2, 3]);
  });

  it("dividend cell values match the dividend digits", () => {
    const layout = computeLayout(solve(7035, 5));
    const dividendCells = cellsOfRole(layout, "dividend");
    expect(cellValues(dividendCells)).toBe("7035");
  });

  it("dividend cells are always present even with completedUpTo=0", () => {
    const layout = computeLayout(solve(84, 4), 0);
    const dividendCells = cellsOfRole(layout, "dividend");
    expect(dividendCells).toHaveLength(2);
    expect(cellValues(dividendCells)).toBe("84");
  });
});

// ---------------------------------------------------------------------------
// Quotient row
// ---------------------------------------------------------------------------

describe("computeLayout – quotient row", () => {
  it("places quotient digits in row 0", () => {
    const layout = computeLayout(solve(84, 4));
    const qCells = cellsOfRole(layout, "quotient");
    expect(qCells.every((c) => c.row === 0)).toBe(true);
  });

  it("quotient digit values match the full quotient", () => {
    const layout = computeLayout(solve(532, 4));
    const qCells = cellsOfRole(layout, "quotient");
    expect(cellValues(qCells)).toBe("133");
  });

  it("quotient digits align to their digitPosition columns", () => {
    // 84 ÷ 4 = 21 → quotient digits at positions 0 and 1
    const layout = computeLayout(solve(84, 4));
    const qCells = cellsOfRole(layout, "quotient");
    expect(qCells[0].col).toBe(0);
    expect(qCells[1].col).toBe(1);
  });

  it("quotient digit positions match solver digitPositions", () => {
    // 156 ÷ 12 = 13 → first quotient at position 1, second at position 2
    const solution = solve(156, 12);
    const layout = computeLayout(solution);
    const qCells = cellsOfRole(layout, "quotient");
    expect(qCells[0].col).toBe(1);
    expect(qCells[1].col).toBe(2);
  });

  it("includes zero quotient digits", () => {
    // 7035 ÷ 5 = 1407 → third quotient digit is 0
    const layout = computeLayout(solve(7035, 5));
    const qCells = cellsOfRole(layout, "quotient");
    expect(cellValues(qCells)).toBe("1407");
    expect(qCells[2].value).toBe("0");
  });
});

// ---------------------------------------------------------------------------
// Work rows (multiply + subtract)
// ---------------------------------------------------------------------------

describe("computeLayout – work rows", () => {
  it("multiply cells have role 'multiply'", () => {
    const layout = computeLayout(solve(84, 4));
    const mCells = cellsOfRole(layout, "multiply");
    expect(mCells.length).toBeGreaterThan(0);
  });

  it("subtract cells have role 'subtract'", () => {
    const layout = computeLayout(solve(84, 4));
    const sCells = cellsOfRole(layout, "subtract");
    expect(sCells.length).toBeGreaterThan(0);
  });

  it("work rows start at row 2", () => {
    const layout = computeLayout(solve(84, 4));
    const workCells = layout.cells.filter(
      (c) => c.role === "multiply" || c.role === "subtract" || c.role === "bring-down",
    );
    const minRow = Math.min(...workCells.map((c) => c.row));
    expect(minRow).toBe(2);
  });

  it("multiply values are right-aligned to their digitPosition", () => {
    // 84 ÷ 4: first multiply is 8 at position 0
    const layout = computeLayout(solve(84, 4));
    const mCells = cellsOfRole(layout, "multiply");
    // First multiply: "8" at col 0
    const firstGroup = mCells.filter((c) => c.row === mCells[0].row);
    expect(firstGroup[firstGroup.length - 1].col).toBe(0);
  });

  it("multi-digit multiply values span correct columns", () => {
    // 532 ÷ 4 = 133: second multiply is 12 at digitPosition 1
    // 12 should span cols 0-1 (right-aligned to col 1)
    const solution = solve(532, 4);
    const layout = computeLayout(solution);
    const mCells = cellsOfRole(layout, "multiply");
    // Find the multiply cells for the second round
    const secondRoundMCells = mCells.filter(
      (c) => c.stepIndex === 5, // step index 5 is the second multiply
    );
    expect(secondRoundMCells).toHaveLength(2);
    expect(secondRoundMCells.map((c) => c.value).join("")).toBe("12");
    expect(secondRoundMCells[0].col).toBe(0);
    expect(secondRoundMCells[1].col).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Bring-down cells
// ---------------------------------------------------------------------------

describe("computeLayout – bring-down cells", () => {
  it("bring-down digit has role 'bring-down'", () => {
    const layout = computeLayout(solve(84, 4));
    const bdCells = cellsOfRole(layout, "bring-down");
    expect(bdCells.length).toBeGreaterThan(0);
  });

  it("bring-down combined row includes subtract digits + brought-down digit", () => {
    // 84 ÷ 4: subtract 8-8=0, bring down 4 → working number 4
    // The combined row should show "4" (since 04 → just "4")
    const layout = computeLayout(solve(84, 4));
    const bdCells = cellsOfRole(layout, "bring-down");
    expect(bdCells).toHaveLength(1);
    expect(bdCells[0].value).toBe("4");
  });

  it("bring-down combined row for multi-digit working numbers", () => {
    // 532 ÷ 4: first bring-down → working number 13
    // Combined row: "1" (subtract) + "3" (bring-down)
    const layout = computeLayout(solve(532, 4));
    // Find the first row that has a bring-down cell
    const bdCells = cellsOfRole(layout, "bring-down");
    expect(bdCells[0].value).toBe("3");
  });
});

// ---------------------------------------------------------------------------
// Separator lines
// ---------------------------------------------------------------------------

describe("computeLayout – separators", () => {
  it("produces separator lines", () => {
    const layout = computeLayout(solve(84, 4));
    expect(layout.separators.length).toBeGreaterThan(0);
  });

  it("number of separators equals number of rounds (one per multiply row)", () => {
    // 84 ÷ 4 has 2 rounds → 2 separators
    const layout84 = computeLayout(solve(84, 4));
    expect(layout84.separators).toHaveLength(2);

    // 532 ÷ 4 has 3 rounds → 3 separators
    const layout532 = computeLayout(solve(532, 4));
    expect(layout532.separators).toHaveLength(3);

    // 7035 ÷ 5 has 4 rounds → 4 separators
    const layout7035 = computeLayout(solve(7035, 5));
    expect(layout7035.separators).toHaveLength(4);
  });

  it("separator afterRow matches the multiply row", () => {
    const layout = computeLayout(solve(84, 4));
    // First multiply row is row 2, so first separator afterRow = 2
    const mCells = cellsOfRole(layout, "multiply");
    const firstMultiplyRow = mCells[0].row;
    expect(layout.separators[0].afterRow).toBe(firstMultiplyRow);
  });

  it("separator colStart ≤ colEnd", () => {
    const layout = computeLayout(solve(7035, 5));
    for (const sep of layout.separators) {
      expect(sep.colStart).toBeLessThanOrEqual(sep.colEnd);
    }
  });
});

// ---------------------------------------------------------------------------
// Remainder label
// ---------------------------------------------------------------------------

describe("computeLayout – remainder", () => {
  it("includes remainder-label cell for problems with remainder", () => {
    const layout = computeLayout(solve(85, 4));
    const rCells = cellsOfRole(layout, "remainder-label");
    expect(rCells).toHaveLength(1);
    expect(rCells[0].value).toBe("R1");
  });

  it("does not include remainder-label for exact division", () => {
    const layout = computeLayout(solve(84, 4));
    const rCells = cellsOfRole(layout, "remainder-label");
    expect(rCells).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Incremental display (completedUpTo)
// ---------------------------------------------------------------------------

describe("computeLayout – completedUpTo (incremental display)", () => {
  it("with completedUpTo=0, only dividend cells are present", () => {
    const layout = computeLayout(solve(84, 4), 0);
    const roles = new Set(layout.cells.map((c) => c.role));
    expect(roles).toEqual(new Set(["dividend"]));
  });

  it("with completedUpTo=1, shows first quotient digit", () => {
    const layout = computeLayout(solve(84, 4), 1);
    const qCells = cellsOfRole(layout, "quotient");
    expect(qCells).toHaveLength(1);
    expect(qCells[0].value).toBe("2");
  });

  it("with completedUpTo=2, shows quotient + first multiply", () => {
    const layout = computeLayout(solve(84, 4), 2);
    const qCells = cellsOfRole(layout, "quotient");
    const mCells = cellsOfRole(layout, "multiply");
    expect(qCells).toHaveLength(1);
    expect(mCells).toHaveLength(1);
  });

  it("completedUpTo=all shows everything", () => {
    const solution = solve(84, 4);
    const full = computeLayout(solution, solution.steps.length);
    const noArg = computeLayout(solution);
    expect(full.cells.length).toBe(noArg.cells.length);
  });

  it("incremental display never shows future steps", () => {
    const solution = solve(532, 4);
    for (let i = 0; i <= solution.steps.length; i++) {
      const layout = computeLayout(solution, i);
      for (const cell of layout.cells) {
        if (cell.stepIndex !== undefined) {
          expect(cell.stepIndex).toBeLessThan(i);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Row ordering invariants
// ---------------------------------------------------------------------------

describe("computeLayout – row ordering", () => {
  it("quotient row (0) < dividend row (1) < work rows", () => {
    const layout = computeLayout(solve(532, 4));
    const qRows = cellsOfRole(layout, "quotient").map((c) => c.row);
    const dRows = cellsOfRole(layout, "dividend").map((c) => c.row);
    const workRows = layout.cells
      .filter((c) => c.role === "multiply" || c.role === "subtract" || c.role === "bring-down")
      .map((c) => c.row);

    expect(Math.max(...qRows)).toBe(0);
    expect(Math.max(...dRows)).toBe(1);
    expect(Math.min(...workRows)).toBeGreaterThanOrEqual(2);
  });

  it("totalRows covers all cells", () => {
    const layout = computeLayout(solve(7035, 5));
    const maxRow = Math.max(...layout.cells.map((c) => c.row));
    expect(layout.totalRows).toBeGreaterThan(maxRow);
  });
});

// ---------------------------------------------------------------------------
// Full example: 84 ÷ 4 = 21
// ---------------------------------------------------------------------------

describe("computeLayout – full example 84 ÷ 4", () => {
  const layout = computeLayout(solve(84, 4));

  it("has correct layout shape", () => {
    expect(layout.totalCols).toBe(2);
    expect(layout.divisorText).toBe("4");
    expect(layout.hasRemainder).toBe(false);
  });

  it("quotient is '21'", () => {
    const q = cellsOfRole(layout, "quotient");
    expect(cellValues(q)).toBe("21");
  });

  it("dividend is '84'", () => {
    const d = cellsOfRole(layout, "dividend");
    expect(cellValues(d)).toBe("84");
  });
});

// ---------------------------------------------------------------------------
// Full example: 156 ÷ 12 = 13 (multi-digit divisor)
// ---------------------------------------------------------------------------

describe("computeLayout – full example 156 ÷ 12", () => {
  const layout = computeLayout(solve(156, 12));

  it("totalCols is 3 (three-digit dividend)", () => {
    expect(layout.totalCols).toBe(3);
  });

  it("divisorText is '12'", () => {
    expect(layout.divisorText).toBe("12");
  });

  it("quotient starts at column 1 (not 0)", () => {
    const q = cellsOfRole(layout, "quotient");
    expect(q[0].col).toBe(1);
    expect(q[1].col).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

describe("computeLayout – module exports", () => {
  it("is exported from @/features/workspace-ui", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ws = require("@/features/workspace-ui");
    expect(typeof ws.computeLayout).toBe("function");
  });

  it("LongDivisionRenderer is exported from @/features/workspace-ui", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ws = require("@/features/workspace-ui");
    expect(typeof ws.LongDivisionRenderer).toBe("function");
  });
});
