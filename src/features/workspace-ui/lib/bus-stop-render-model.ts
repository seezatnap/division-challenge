import type { LongDivisionStep } from "@/features/contracts";

export type BusStopWorkRowKind = Exclude<LongDivisionStep["kind"], "quotient-digit">;

export interface BusStopQuotientCell {
  stepId: string;
  targetId: string | null;
  value: string;
  isFilled: boolean;
}

export interface BusStopWorkRow {
  stepId: string;
  targetId: string | null;
  kind: BusStopWorkRowKind;
  value: string;
  isFilled: boolean;
  displayPrefix: "-" | "";
}

export interface BuildBusStopRenderModelInput {
  divisor: number;
  dividend: number;
  steps: readonly LongDivisionStep[];
  revealedStepCount?: number;
}

export interface BusStopRenderModel {
  divisorText: string;
  dividendText: string;
  activeTargetId: string | null;
  quotientCells: readonly BusStopQuotientCell[];
  workRows: readonly BusStopWorkRow[];
}

function clampRevealedStepCount(totalStepCount: number, revealedStepCount?: number): number {
  if (typeof revealedStepCount === "undefined") {
    return totalStepCount;
  }

  if (!Number.isFinite(revealedStepCount)) {
    return 0;
  }

  const normalizedStepCount = Math.trunc(revealedStepCount);
  return Math.min(Math.max(normalizedStepCount, 0), totalStepCount);
}

function isWorkRowStep(step: LongDivisionStep): step is LongDivisionStep & { kind: BusStopWorkRowKind } {
  return step.kind !== "quotient-digit";
}

export function buildBusStopRenderModel({
  divisor,
  dividend,
  steps,
  revealedStepCount,
}: BuildBusStopRenderModelInput): BusStopRenderModel {
  const boundedRevealedStepCount = clampRevealedStepCount(steps.length, revealedStepCount);

  const quotientCells: BusStopQuotientCell[] = [];
  const workRows: BusStopWorkRow[] = [];

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    const isFilled = stepIndex < boundedRevealedStepCount;
    const isActiveStep = stepIndex === boundedRevealedStepCount;

    if (step.kind === "quotient-digit") {
      quotientCells.push({
        stepId: step.id,
        targetId: step.inputTargetId,
        value: isFilled ? step.expectedValue : "",
        isFilled,
      });

      continue;
    }

    if (!isWorkRowStep(step) || (!isFilled && !isActiveStep)) {
      continue;
    }

    workRows.push({
      stepId: step.id,
      targetId: step.inputTargetId,
      kind: step.kind,
      value: isFilled ? step.expectedValue : "",
      isFilled,
      displayPrefix: step.kind === "multiply-result" ? "-" : "",
    });
  }

  return {
    divisorText: String(divisor),
    dividendText: String(dividend),
    activeTargetId: steps[boundedRevealedStepCount]?.inputTargetId ?? null,
    quotientCells,
    workRows,
  };
}
