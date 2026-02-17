"use client";

import React, { useMemo } from "react";
import type { DivisionSolution } from "@/types";
import { computeLayout, type CellRole } from "./layout-engine";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface LongDivisionRendererProps {
  /** The solved division problem to render. */
  solution: DivisionSolution;
  /**
   * Number of completed steps to display (steps with index < completedUpTo).
   * Defaults to all steps (full worked solution).
   */
  completedUpTo?: number;
}

// ---------------------------------------------------------------------------
// Styling
// ---------------------------------------------------------------------------

/** Shared base classes for every cell in the grid. */
const CELL_BASE =
  "flex items-center justify-center font-mono text-lg leading-none";

function roleClass(role: CellRole): string {
  switch (role) {
    case "quotient":
      return "text-[#8b6914] font-bold";
    case "dividend":
      return "text-[#2c1810] font-semibold";
    case "multiply":
      return "text-[#3d7a35]";
    case "subtract":
      return "text-[#5c3a28]";
    case "bring-down":
      return "text-[#d4a017] font-semibold";
    case "remainder-label":
      return "text-[#8b2500] font-bold text-sm";
    default:
      return "text-[#2c1810]";
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Renders the classic "bus-stop" long-division notation as paper-like
 * notation using a CSS-grid layout.
 *
 * Visual structure:
 * ```
 *              Q  Q  Q          ← quotient row
 *           ┌──────────
 *   D  D    │  d  d  d  d      ← dividend row
 *           │  work rows...
 * ```
 */
export function LongDivisionRenderer({
  solution,
  completedUpTo,
}: LongDivisionRendererProps) {
  const layout = useMemo(
    () => computeLayout(solution, completedUpTo),
    [solution, completedUpTo],
  );

  const { cells, separators, totalCols, totalRows, divisorText } = layout;

  // Column layout:
  //   [0..divisorLen-1]  = divisor digit columns
  //   [divisorLen]       = bracket column (narrow, for the vertical stroke)
  //   [divisorLen+1 .. divisorLen+totalCols] = dividend/work digit columns
  const divisorLen = divisorText.length;
  const gridCols = divisorLen + 1 + totalCols;

  // Cell size in pixels — drives the CSS grid track sizing
  const cellW = 32;

  return (
    <div
      className="inline-block select-none"
      role="figure"
      aria-label={`Long division: ${solution.problem.dividend} divided by ${solution.problem.divisor}`}
    >
      <div
        className="relative inline-grid"
        style={{
          gridTemplateColumns: [
            // Divisor columns
            ...Array(divisorLen).fill(`${cellW}px`),
            // Bracket column (thin)
            "4px",
            // Dividend / work columns
            ...Array(totalCols).fill(`${cellW}px`),
          ].join(" "),
          gridTemplateRows: `repeat(${totalRows}, ${cellW}px)`,
          alignItems: "center",
          justifyItems: "center",
        }}
      >
        {/* ── Divisor digits (row 1, the dividend row) ─────────── */}
        {divisorText.split("").map((d, i) => (
          <div
            key={`div-${i}`}
            className={`${CELL_BASE} text-[#2c1810] font-semibold`}
            style={{ gridColumn: i + 1, gridRow: 2 }}
          >
            {d}
          </div>
        ))}

        {/* ── Bracket: vertical line ───────────────────────────── */}
        <div
          className="bg-[#2c1810]"
          style={{
            gridColumn: divisorLen + 1,
            gridRow: `2 / ${totalRows + 1}`,
            width: "2px",
            height: "100%",
            justifySelf: "center",
          }}
          aria-hidden
        />

        {/* ── Bracket: horizontal overline (between quotient and dividend) */}
        <div
          className="bg-[#2c1810]"
          style={{
            gridColumn: `${divisorLen + 1} / ${gridCols + 1}`,
            gridRow: 1,
            height: "2px",
            width: "100%",
            alignSelf: "end",
          }}
          aria-hidden
        />

        {/* ── Content cells (quotient, dividend, work rows) ────── */}
        {cells.map((cell, idx) => {
          // Map cell.col (0-based dividend column) → grid column
          const gridCol = divisorLen + 1 + cell.col + 1; // +1 bracket, +1 one-based
          const gridRow = cell.row + 1; // one-based

          // Remainder labels span outside the normal grid;
          // skip them here and render separately.
          if (cell.role === "remainder-label") return null;

          return (
            <div
              key={`c-${idx}`}
              className={`${CELL_BASE} ${roleClass(cell.role)}`}
              style={{ gridColumn: gridCol, gridRow }}
              data-role={cell.role}
              data-step-index={cell.stepIndex}
            >
              {cell.value}
            </div>
          );
        })}

        {/* ── Separator lines ──────────────────────────────────── */}
        {separators.map((sep, idx) => {
          const gridColStart = divisorLen + 1 + sep.colStart + 1;
          const gridColEnd = divisorLen + 1 + sep.colEnd + 2; // inclusive→exclusive + 1-based
          const gridRow = sep.afterRow + 1; // sits at the bottom of its row

          return (
            <div
              key={`s-${idx}`}
              className="pointer-events-none"
              style={{
                gridColumn: `${gridColStart} / ${gridColEnd}`,
                gridRow,
                height: "2px",
                width: "100%",
                alignSelf: "end",
                backgroundColor: "#5c3a28",
              }}
              aria-hidden
            />
          );
        })}
      </div>

      {/* ── Remainder label (outside the grid, after the last work row) */}
      {(() => {
        const rCell = cells.find((c) => c.role === "remainder-label");
        if (!rCell) return null;
        return (
          <div className="mt-1 text-right">
            <span className={`${CELL_BASE} ${roleClass("remainder-label")} inline-flex`}>
              {rCell.value}
            </span>
          </div>
        );
      })()}
    </div>
  );
}
