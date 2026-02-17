import React from "react";
import { render, screen } from "@testing-library/react";
import { DifficultyLevel } from "@/types";
import type { DivisionProblem, DivisionSolution } from "@/types";
import { solveDivisionProblem } from "@/features/division-engine/solver";
import { LongDivisionRenderer } from "@/features/workspace-ui/LongDivisionRenderer";

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
// Rendering tests
// ---------------------------------------------------------------------------

describe("LongDivisionRenderer", () => {
  it("renders without crashing", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(84, 4)} />,
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("has an accessible figure role with aria-label", () => {
    render(<LongDivisionRenderer solution={solve(84, 4)} />);
    const figure = screen.getByRole("figure");
    expect(figure).toBeInTheDocument();
    expect(figure).toHaveAttribute(
      "aria-label",
      "Long division: 84 divided by 4",
    );
  });

  it("displays the divisor text", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(84, 4)} />,
    );
    // The divisor "4" should appear in the rendered output
    const allText = container.textContent ?? "";
    expect(allText).toContain("4");
  });

  it("displays all dividend digits", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(7035, 5)} />,
    );
    const allText = container.textContent ?? "";
    // "7", "0", "3", "5" should all be present
    expect(allText).toContain("7");
    expect(allText).toContain("0");
    expect(allText).toContain("3");
    expect(allText).toContain("5");
  });

  it("displays quotient digits", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(84, 4)} />,
    );
    // Quotient is 21
    const quotientCells = container.querySelectorAll('[data-role="quotient"]');
    const quotientText = Array.from(quotientCells)
      .map((el) => el.textContent)
      .join("");
    expect(quotientText).toBe("21");
  });

  it("displays multiply values", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(84, 4)} />,
    );
    const multiplyCells = container.querySelectorAll('[data-role="multiply"]');
    expect(multiplyCells.length).toBeGreaterThan(0);
  });

  it("displays subtract values", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(84, 4)} />,
    );
    const subtractCells = container.querySelectorAll('[data-role="subtract"]');
    expect(subtractCells.length).toBeGreaterThan(0);
  });

  it("marks bring-down digits with correct data-role", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(532, 4)} />,
    );
    const bdCells = container.querySelectorAll('[data-role="bring-down"]');
    expect(bdCells.length).toBeGreaterThan(0);
  });

  it("renders correctly for multi-digit divisors", () => {
    render(<LongDivisionRenderer solution={solve(156, 12)} />);
    const figure = screen.getByRole("figure");
    expect(figure).toHaveAttribute(
      "aria-label",
      "Long division: 156 divided by 12",
    );
    // Should contain divisor digits 1 and 2
    expect(figure.textContent).toContain("1");
    expect(figure.textContent).toContain("2");
  });

  it("handles problems with zero quotient digits", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(7035, 5)} />,
    );
    // Quotient is 1407 — should have a "0" in the quotient
    const quotientCells = container.querySelectorAll('[data-role="quotient"]');
    const quotientText = Array.from(quotientCells)
      .map((el) => el.textContent)
      .join("");
    expect(quotientText).toBe("1407");
  });

  it("shows remainder label for problems with remainder", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(85, 4)} />,
    );
    const allText = container.textContent ?? "";
    expect(allText).toContain("R1");
  });

  it("does not show remainder label for exact division", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(84, 4)} />,
    );
    const allText = container.textContent ?? "";
    expect(allText).not.toContain("R");
  });

  it("includes CSS grid layout via inline styles", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(84, 4)} />,
    );
    const gridEl = container.querySelector("[style*='grid-template-columns']");
    expect(gridEl).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// completedUpTo (incremental rendering)
// ---------------------------------------------------------------------------

describe("LongDivisionRenderer – completedUpTo", () => {
  it("with completedUpTo=0, shows only dividend and bracket elements", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(84, 4)} completedUpTo={0} />,
    );
    const quotientCells = container.querySelectorAll('[data-role="quotient"]');
    expect(quotientCells).toHaveLength(0);
    // Dividend should still be present
    const dividendCells = container.querySelectorAll('[data-role="dividend"]');
    expect(dividendCells.length).toBeGreaterThan(0);
  });

  it("with completedUpTo=1, shows first quotient digit only", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(84, 4)} completedUpTo={1} />,
    );
    const quotientCells = container.querySelectorAll('[data-role="quotient"]');
    expect(quotientCells).toHaveLength(1);
    expect(quotientCells[0].textContent).toBe("2");
  });

  it("progressively adds more content with higher completedUpTo", () => {
    const solution = solve(84, 4);
    let prevCellCount = 0;
    for (let i = 0; i <= solution.steps.length; i++) {
      const { container } = render(
        <LongDivisionRenderer solution={solution} completedUpTo={i} />,
      );
      const cellCount = container.querySelectorAll("[data-role]").length;
      expect(cellCount).toBeGreaterThanOrEqual(prevCellCount);
      prevCellCount = cellCount;
    }
  });

  it("all steps shown equals default (no completedUpTo)", () => {
    const solution = solve(532, 4);
    const { container: full } = render(
      <LongDivisionRenderer
        solution={solution}
        completedUpTo={solution.steps.length}
      />,
    );
    const { container: def } = render(
      <LongDivisionRenderer solution={solution} />,
    );
    expect(full.querySelectorAll("[data-role]").length).toBe(
      def.querySelectorAll("[data-role]").length,
    );
  });
});

// ---------------------------------------------------------------------------
// Bracket rendering
// ---------------------------------------------------------------------------

describe("LongDivisionRenderer – bracket elements", () => {
  it("renders bracket vertical line (aria-hidden)", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(84, 4)} />,
    );
    const ariaHidden = container.querySelectorAll("[aria-hidden]");
    // Should have at least 2 bracket elements (vertical + horizontal)
    expect(ariaHidden.length).toBeGreaterThanOrEqual(2);
  });

  it("separator lines are aria-hidden", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(84, 4)} />,
    );
    // All separator divs should be aria-hidden
    const seps = container.querySelectorAll("[aria-hidden]");
    expect(seps.length).toBeGreaterThan(0);
    seps.forEach((el) => {
      expect(el.getAttribute("aria-hidden")).toBe("true");
    });
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("LongDivisionRenderer – edge cases", () => {
  it("renders large dividends (5 digits)", () => {
    const { container } = render(
      <LongDivisionRenderer solution={solve(10000, 100)} />,
    );
    const dividendCells = container.querySelectorAll('[data-role="dividend"]');
    expect(dividendCells).toHaveLength(5);
  });

  it("renders problems where first digit < divisor (leading consume)", () => {
    // 100 ÷ 4: first digit 1 < 4, so solver takes "10" first
    const { container } = render(
      <LongDivisionRenderer solution={solve(100, 4)} />,
    );
    const quotientCells = container.querySelectorAll('[data-role="quotient"]');
    const qText = Array.from(quotientCells)
      .map((el) => el.textContent)
      .join("");
    expect(qText).toBe("25");
  });
});
