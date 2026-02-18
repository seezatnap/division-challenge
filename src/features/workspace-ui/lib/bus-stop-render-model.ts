import type { LongDivisionStep } from "@/features/contracts";

export type BusStopWorkRowKind = Exclude<LongDivisionStep["kind"], "quotient-digit">;

export interface BusStopQuotientCell {
  stepId: string;
  targetId: string | null;
  columnIndex: number;
  value: string;
  isFilled: boolean;
  isActive: boolean;
}

export interface BusStopWorkRow {
  stepId: string;
  targetId: string | null;
  kind: BusStopWorkRowKind;
  columnIndex: number;
  expectedDigitCount: number;
  value: string;
  isFilled: boolean;
  isActive: boolean;
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
  columnCount: number;
  activeStepId: string | null;
  activeTargetId: string | null;
  activeStepFocus: BusStopActiveStepFocus;
  quotientCells: readonly BusStopQuotientCell[];
  workRows: readonly BusStopWorkRow[];
}

export interface SingleActiveCellGlowState {
  activeStepId: LongDivisionStep["id"] | null;
  activeTargetId: string | null;
}

export interface BusStopWorkingDividendWindow {
  startColumnIndex: number;
  endColumnIndex: number;
}

export interface BusStopActiveStepFocus {
  stepId: LongDivisionStep["id"] | null;
  stepKind: LongDivisionStep["kind"] | "none";
  divisorText: string;
  workingValueText: string | null;
  workingDividendWindow: BusStopWorkingDividendWindow | null;
  quotientDigitText: string | null;
  multiplyValueText: string | null;
  subtractionValueText: string | null;
  bringDownDigitText: string | null;
  shouldHighlightDivisor: boolean;
  shouldHighlightWorkingDividend: boolean;
}

interface ActiveStepReplayState {
  workingNumber: number;
  workingStartColumnIndex: number;
  workingEndColumnIndex: number;
  currentQuotientDigitText: string | null;
  currentMultiplyValueText: string | null;
  currentSubtractionValueText: string | null;
}

interface BuildActiveStepFocusByStepIdInput {
  dividend: number;
  divisor: number;
  steps: readonly LongDivisionStep[];
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

function createEmptyActiveStepFocus(divisorText: string): BusStopActiveStepFocus {
  return {
    stepId: null,
    stepKind: "none",
    divisorText,
    workingValueText: null,
    workingDividendWindow: null,
    quotientDigitText: null,
    multiplyValueText: null,
    subtractionValueText: null,
    bringDownDigitText: null,
    shouldHighlightDivisor: false,
    shouldHighlightWorkingDividend: false,
  };
}

function toDividendDigits(dividend: number): number[] {
  return Array.from(String(dividend), (digitCharacter) => {
    const digitValue = Number.parseInt(digitCharacter, 10);

    if (Number.isNaN(digitValue)) {
      throw new Error("dividend must contain only numeric digits.");
    }

    return digitValue;
  });
}

function resolveInitialReplayState(dividendDigits: readonly number[], divisor: number): ActiveStepReplayState {
  const normalizedDividendDigits = dividendDigits.length > 0 ? dividendDigits : [0];
  const workingStartColumnIndex = 0;
  let workingEndColumnIndex = 0;
  let workingNumber = normalizedDividendDigits[0] ?? 0;

  while (workingNumber < divisor && workingEndColumnIndex < normalizedDividendDigits.length - 1) {
    workingEndColumnIndex += 1;
    workingNumber = (workingNumber * 10) + (normalizedDividendDigits[workingEndColumnIndex] ?? 0);
  }

  return {
    workingNumber,
    workingStartColumnIndex,
    workingEndColumnIndex,
    currentQuotientDigitText: null,
    currentMultiplyValueText: null,
    currentSubtractionValueText: null,
  };
}

function toStepValueText(step: LongDivisionStep): string {
  const trimmedValue = step.expectedValue.trim();
  return trimmedValue.length > 0 ? trimmedValue : "0";
}

function resolveBringDownDisplayValue(stepValueText: string): string {
  const trailingDigit = stepValueText.trim().at(-1);
  if (trailingDigit && /^[0-9]$/.test(trailingDigit)) {
    return trailingDigit;
  }

  return "0";
}

function shouldHighlightDivisorForStepKind(stepKind: LongDivisionStep["kind"]): boolean {
  return stepKind === "quotient-digit" || stepKind === "multiply-result";
}

function shouldHighlightWorkingDividendForStepKind(stepKind: LongDivisionStep["kind"]): boolean {
  return stepKind === "quotient-digit" || stepKind === "multiply-result" || stepKind === "subtraction-result";
}

function buildActiveStepFocusByStepId({
  dividend,
  divisor,
  steps,
}: BuildActiveStepFocusByStepIdInput): Map<LongDivisionStep["id"], BusStopActiveStepFocus> {
  const focusByStepId = new Map<LongDivisionStep["id"], BusStopActiveStepFocus>();
  const divisorText = String(divisor);
  const replayState = resolveInitialReplayState(toDividendDigits(dividend), divisor);
  const dividendDigits = toDividendDigits(dividend);

  for (const step of steps) {
    const stepValueText = toStepValueText(step);
    const baseFocus: BusStopActiveStepFocus = {
      stepId: step.id,
      stepKind: step.kind,
      divisorText,
      workingValueText: String(replayState.workingNumber),
      workingDividendWindow: {
        startColumnIndex: replayState.workingStartColumnIndex,
        endColumnIndex: replayState.workingEndColumnIndex,
      },
      quotientDigitText: replayState.currentQuotientDigitText,
      multiplyValueText: replayState.currentMultiplyValueText,
      subtractionValueText: replayState.currentSubtractionValueText,
      bringDownDigitText: null,
      shouldHighlightDivisor: shouldHighlightDivisorForStepKind(step.kind),
      shouldHighlightWorkingDividend: shouldHighlightWorkingDividendForStepKind(step.kind),
    };

    if (step.kind === "quotient-digit") {
      replayState.currentQuotientDigitText = stepValueText;
      replayState.currentMultiplyValueText = null;
      replayState.currentSubtractionValueText = null;
      baseFocus.quotientDigitText = stepValueText;
      focusByStepId.set(step.id, baseFocus);
      continue;
    }

    if (step.kind === "multiply-result") {
      replayState.currentMultiplyValueText = stepValueText;
      baseFocus.multiplyValueText = stepValueText;
      focusByStepId.set(step.id, baseFocus);
      continue;
    }

    if (step.kind === "subtraction-result") {
      replayState.currentSubtractionValueText = stepValueText;
      baseFocus.subtractionValueText = stepValueText;
      focusByStepId.set(step.id, baseFocus);
      continue;
    }

    const nextDividendDigitIndex = Math.min(
      replayState.workingEndColumnIndex + 1,
      Math.max(dividendDigits.length - 1, 0),
    );
    const bringDownDigitText = String(
      dividendDigits[nextDividendDigitIndex] ?? Number.parseInt(stepValueText.at(-1) ?? "0", 10),
    );
    const nextWorkingNumber = Number.parseInt(stepValueText, 10);
    const normalizedWorkingNumber = Number.isNaN(nextWorkingNumber) ? 0 : nextWorkingNumber;
    const nextWorkingDigitCount = Math.max(String(normalizedWorkingNumber).length, 1);
    const nextWorkingStartColumnIndex = Math.max(nextDividendDigitIndex - nextWorkingDigitCount + 1, 0);

    replayState.workingNumber = normalizedWorkingNumber;
    replayState.workingStartColumnIndex = nextWorkingStartColumnIndex;
    replayState.workingEndColumnIndex = nextDividendDigitIndex;
    replayState.currentQuotientDigitText = null;
    replayState.currentMultiplyValueText = null;
    replayState.currentSubtractionValueText = null;

    focusByStepId.set(step.id, {
      ...baseFocus,
      workingValueText: stepValueText,
      workingDividendWindow: {
        startColumnIndex: nextWorkingStartColumnIndex,
        endColumnIndex: nextDividendDigitIndex,
      },
      subtractionValueText: baseFocus.subtractionValueText,
      bringDownDigitText,
      shouldHighlightDivisor: false,
      shouldHighlightWorkingDividend: true,
    });
  }

  return focusByStepId;
}

export function resolveSingleActiveCellGlowState(
  steps: readonly LongDivisionStep[],
  revealedStepCount?: number,
): SingleActiveCellGlowState {
  const boundedRevealedStepCount = clampRevealedStepCount(steps.length, revealedStepCount);
  const activeStep = steps[boundedRevealedStepCount];

  return {
    activeStepId: activeStep?.id ?? null,
    activeTargetId: activeStep?.inputTargetId ?? null,
  };
}

export function buildBusStopRenderModel({
  divisor,
  dividend,
  steps,
  revealedStepCount,
}: BuildBusStopRenderModelInput): BusStopRenderModel {
  const divisorText = String(divisor);
  const dividendText = String(dividend);
  const columnCount = Math.max(dividendText.length, 1);
  const boundedRevealedStepCount = clampRevealedStepCount(steps.length, revealedStepCount);
  const glowState = resolveSingleActiveCellGlowState(steps, boundedRevealedStepCount);
  const activeStepFocusByStepId = buildActiveStepFocusByStepId({
    dividend,
    divisor,
    steps,
  });
  const activeStepFocus =
    glowState.activeStepId && activeStepFocusByStepId.has(glowState.activeStepId)
      ? (activeStepFocusByStepId.get(glowState.activeStepId) as BusStopActiveStepFocus)
      : createEmptyActiveStepFocus(divisorText);

  const quotientCells: BusStopQuotientCell[] = [];
  const workRows: BusStopWorkRow[] = [];
  const quotientCellCount = steps.filter((step) => step.kind === "quotient-digit").length;
  const quotientLeadingColumnOffset = Math.max(columnCount - quotientCellCount, 0);
  let quotientColumnIndex = quotientLeadingColumnOffset;
  let activeWorkColumnIndex = quotientLeadingColumnOffset;

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    const isFilled = stepIndex < boundedRevealedStepCount;
    const isActiveStep = stepIndex === boundedRevealedStepCount;

    if (step.kind === "quotient-digit") {
      quotientCells.push({
        stepId: step.id,
        targetId: step.inputTargetId,
        columnIndex: quotientColumnIndex,
        value: isFilled ? step.expectedValue : "",
        isFilled,
        isActive: glowState.activeStepId === step.id,
      });
      activeWorkColumnIndex = quotientColumnIndex;
      quotientColumnIndex += 1;

      continue;
    }

    if (!isWorkRowStep(step) || (!isFilled && !isActiveStep)) {
      continue;
    }

    const workRowColumnIndex =
      step.kind === "bring-down"
        ? Math.min(activeWorkColumnIndex + 1, columnCount - 1)
        : activeWorkColumnIndex;

    workRows.push({
      stepId: step.id,
      targetId: step.inputTargetId,
      kind: step.kind,
      columnIndex: workRowColumnIndex,
      expectedDigitCount:
        step.kind === "bring-down" ? 1 : Math.max(step.expectedValue.length, 1),
      value: isFilled
        ? step.kind === "bring-down"
          ? resolveBringDownDisplayValue(step.expectedValue)
          : step.expectedValue
        : "",
      isFilled,
      isActive: glowState.activeStepId === step.id,
      displayPrefix: step.kind === "multiply-result" ? "-" : "",
    });

    if (step.kind === "bring-down") {
      activeWorkColumnIndex = workRowColumnIndex;
    }
  }

  return {
    divisorText,
    dividendText,
    columnCount,
    activeStepId: glowState.activeStepId,
    activeTargetId: glowState.activeTargetId,
    activeStepFocus,
    quotientCells,
    workRows,
  };
}
