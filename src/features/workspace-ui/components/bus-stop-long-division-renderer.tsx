"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type { LongDivisionStep } from "@/features/contracts";
import {
  validateLongDivisionStepAnswer,
  type LongDivisionStepValidationResult,
} from "@/features/division-engine/lib/step-validation";
import {
  applyLiveWorkspaceEntryInput,
  type BusStopActiveStepFocus,
  buildBringDownAnimationSourceByStepId,
  buildBusStopRenderModel,
  createLiveWorkspaceTypingState,
  resolveInlineWorkspaceEntryValue,
  sanitizeInlineWorkspaceEntryValue,
  type BusStopWorkRow,
  tryAutoAdvanceBringDownStep,
  type LiveWorkspaceEntryInputTransition,
  type LiveWorkspaceTypingState,
  type WorkspaceDraftEntryValues,
} from "@/features/workspace-ui/lib";

const LOCK_IN_ANIMATION_DURATION_MS = 280;
const BRING_DOWN_ANIMATION_DURATION_MS = 420;
const WORK_ROW_REVEAL_ANIMATION_DURATION_MS = 340;
const ENTRY_ERROR_PULSE_DURATION_MS = 360;
const ENTRY_RETRY_LOCK_DURATION_MS = 2000;
const NON_DIGIT_KEY_PATTERN = /^\D$/;
const EMPTY_DRAFT_ENTRY_VALUES: WorkspaceDraftEntryValues = {};

export interface BusStopLongDivisionRendererProps {
  divisor: number;
  dividend: number;
  steps: readonly LongDivisionStep[];
  revealedStepCount?: number;
  enableLiveTyping?: boolean;
  onStepValidation?: (validation: LongDivisionStepValidationResult) => void;
  onActiveStepFocusChange?: (focus: BusStopActiveStepFocus) => void;
}

type InlineEntryLane = "quotient" | "work-row";

interface WorkspaceInlineEntryProps {
  stepId: string;
  lane: InlineEntryLane;
  stepKind: LongDivisionStep["kind"];
  targetId: string | null;
  digitIndex?: number;
  value: string;
  isFilled: boolean;
  isActive: boolean;
  isInteractive: boolean;
  isAutoEntry: boolean;
  isLockingIn: boolean;
  isErrorPulse: boolean;
  isRetryLocked: boolean;
  style?: CSSProperties;
  onInput?: (event: FormEvent<HTMLSpanElement>) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLSpanElement>) => void;
  onPaste?: (event: ClipboardEvent<HTMLSpanElement>) => void;
}

interface InlineDigitCellContext {
  stepId: string;
  expectedDigits: readonly string[];
  activeDigitIndex: number;
}

interface ActiveEditableEntryLocator {
  stepId: string;
  targetId: string;
  digitIndex: number;
}

interface CollapsedWorkRow {
  row: BusStopWorkRow;
  bringDownCompanion: BusStopWorkRow | null;
}

type DivisionNotationStyle = CSSProperties & {
  "--division-column-count"?: number;
  "--work-value-start-column"?: number;
  "--work-value-column-span"?: number;
};

function buildInlineEntryClassName({
  lane,
  isFilled,
  isActive,
  isLockingIn,
  isErrorPulse,
  isRetryLocked,
}: Pick<
  WorkspaceInlineEntryProps,
  "lane" | "isFilled" | "isActive" | "isLockingIn" | "isErrorPulse" | "isRetryLocked"
>): string {
  const classes = [
    "inline-entry",
    lane === "quotient"
      ? "inline-entry-quotient digit-cell quotient-digit-cell"
      : "inline-entry-work-row work-row-value",
    isFilled ? "inline-entry-locked" : "inline-entry-pending",
    lane === "quotient" && !isFilled ? "quotient-digit-empty" : "",
    isActive ? "inline-entry-active glow-amber" : "",
    isLockingIn ? "inline-entry-lock-in" : "",
    isErrorPulse ? "inline-entry-error-pulse" : "",
    isRetryLocked ? "inline-entry-retry-lock" : "",
  ];

  return classes.filter(Boolean).join(" ");
}

function renderInlineEntryText(value: string): string {
  return value.length > 0 ? value : "\u00a0";
}

function resolveExpectedStepDigits(expectedValue: string): string[] {
  return Array.from(sanitizeInlineWorkspaceEntryValue(expectedValue));
}

function resolveActiveDigitIndex(currentValue: string, expectedDigitCount: number): number {
  if (expectedDigitCount <= 1) {
    return 0;
  }

  return Math.min(currentValue.length, expectedDigitCount - 1);
}

function collapseBringDownWorkRows(workRows: readonly BusStopWorkRow[]): CollapsedWorkRow[] {
  const collapsedRows: CollapsedWorkRow[] = [];

  for (const row of workRows) {
    if (row.kind !== "bring-down") {
      collapsedRows.push({
        row,
        bringDownCompanion: null,
      });
      continue;
    }

    const previousCollapsedRow = collapsedRows.at(-1);
    if (
      previousCollapsedRow &&
      previousCollapsedRow.row.kind === "subtraction-result" &&
      !previousCollapsedRow.bringDownCompanion
    ) {
      previousCollapsedRow.bringDownCompanion = row;
      continue;
    }

    collapsedRows.push({
      row,
      bringDownCompanion: null,
    });
  }

  return collapsedRows;
}

function WorkspaceInlineEntry({
  stepId,
  lane,
  stepKind,
  targetId,
  digitIndex,
  value,
  isFilled,
  isActive,
  isInteractive,
  isAutoEntry,
  isLockingIn,
  isErrorPulse,
  isRetryLocked,
  style,
  onInput,
  onKeyDown,
  onPaste,
}: WorkspaceInlineEntryProps) {
  const isEditable = isInteractive && !isFilled && !isAutoEntry && !isRetryLocked && Boolean(targetId);

  return (
    <span
      aria-label={isEditable ? "Inline workspace entry" : undefined}
      aria-invalid={isErrorPulse ? true : undefined}
      className={buildInlineEntryClassName({
        lane,
        isFilled,
        isActive,
        isLockingIn,
        isErrorPulse,
        isRetryLocked,
      })}
      contentEditable={isEditable}
      data-entry-active={isActive ? "true" : "false"}
      data-entry-auto={isAutoEntry ? "true" : "false"}
      data-entry-animation={isLockingIn ? "lock-in" : "none"}
      data-entry-error={isErrorPulse ? "pulse" : isRetryLocked ? "locked" : "none"}
      data-entry-glow={isActive ? "amber" : "none"}
      data-entry-inline="true"
      data-entry-lane={lane}
      data-entry-live={isInteractive ? "true" : "false"}
      data-entry-lock-pulse={isLockingIn ? stepKind : "none"}
      data-entry-step-kind={stepKind}
      data-entry-step-id={stepId}
      data-entry-state={isFilled ? "locked" : "pending"}
      data-glow-cadence={isActive ? stepKind : "none"}
      data-entry-target-id={targetId ?? ""}
      data-entry-digit-index={typeof digitIndex === "number" ? String(digitIndex) : ""}
      onInput={isEditable ? onInput : undefined}
      onKeyDown={isEditable ? onKeyDown : undefined}
      onPaste={isEditable ? onPaste : undefined}
      role={isEditable ? "textbox" : undefined}
      spellCheck={false}
      style={style}
      suppressContentEditableWarning={isEditable}
      tabIndex={isEditable ? 0 : undefined}
    >
      {renderInlineEntryText(value)}
    </span>
  );
}

export function BusStopLongDivisionRenderer({
  divisor,
  dividend,
  steps,
  revealedStepCount,
  enableLiveTyping,
  onStepValidation,
  onActiveStepFocusChange,
}: BusStopLongDivisionRendererProps) {
  const liveTypingEnabled = enableLiveTyping ?? typeof revealedStepCount === "undefined";
  const stepIdentity = useMemo(() => steps.map((step) => step.id).join("|"), [steps]);
  const [liveTypingRuntimeState, setLiveTypingRuntimeState] = useState<{
    stepIdentity: string;
    state: LiveWorkspaceTypingState;
  }>(() => ({
    stepIdentity,
    state: createLiveWorkspaceTypingState({
      stepCount: steps.length,
      revealedStepCount,
    }),
  }));
  const liveTypingState =
    liveTypingRuntimeState.stepIdentity === stepIdentity
      ? liveTypingRuntimeState.state
      : createLiveWorkspaceTypingState({
          stepCount: steps.length,
          revealedStepCount,
        });
  const liveTypingStateRef = useRef<LiveWorkspaceTypingState>(liveTypingState);
  const [lockInAnimationState, setLockInAnimationState] = useState<{
    stepIdentity: string;
    stepIds: Record<string, true>;
  }>({
    stepIdentity,
    stepIds: {},
  });
  const lockingStepIds =
    lockInAnimationState.stepIdentity === stepIdentity ? lockInAnimationState.stepIds : {};
  const lockTimeoutByStepIdRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const rowRevealTimeoutByStepIdRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const bringDownAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastActiveStepFocusIdentityRef = useRef<string | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);
  const [bringDownAnimationState, setBringDownAnimationState] = useState<{
    stepIdentity: string;
    stepId: string | null;
  }>({
    stepIdentity,
    stepId: null,
  });
  const bringDownAnimationStepId =
    bringDownAnimationState.stepIdentity === stepIdentity ? bringDownAnimationState.stepId : null;
  const [rowRevealAnimationState, setRowRevealAnimationState] = useState<{
    stepIdentity: string;
    stepIds: Record<string, true>;
  }>({
    stepIdentity,
    stepIds: {},
  });
  const rowRevealStepIds =
    rowRevealAnimationState.stepIdentity === stepIdentity ? rowRevealAnimationState.stepIds : {};
  const [entryErrorPulseState, setEntryErrorPulseState] = useState<{
    stepIdentity: string;
    stepIds: Record<string, true>;
  }>({
    stepIdentity,
    stepIds: {},
  });
  const errorPulseStepIds =
    entryErrorPulseState.stepIdentity === stepIdentity ? entryErrorPulseState.stepIds : {};
  const [entryRetryLockState, setEntryRetryLockState] = useState<{
    stepIdentity: string;
    stepIds: Record<string, true>;
  }>({
    stepIdentity,
    stepIds: {},
  });
  const retryLockedStepIds =
    entryRetryLockState.stepIdentity === stepIdentity ? entryRetryLockState.stepIds : {};
  const errorPulseTimeoutByStepIdRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const retryLockTimeoutByStepIdRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const effectiveRevealedStepCount = liveTypingEnabled
    ? liveTypingState.revealedStepCount
    : revealedStepCount;
  const draftEntryValues = liveTypingEnabled
    ? liveTypingState.draftEntryValues
    : EMPTY_DRAFT_ENTRY_VALUES;

  const renderModel = useMemo(
    () =>
      buildBusStopRenderModel({
        divisor,
        dividend,
        steps,
        revealedStepCount: effectiveRevealedStepCount,
      }),
    [divisor, dividend, steps, effectiveRevealedStepCount],
  );
  const dividendDigits = useMemo(() => Array.from(renderModel.dividendText), [renderModel.dividendText]);
  const collapsedWorkRows = useMemo(
    () => collapseBringDownWorkRows(renderModel.workRows),
    [renderModel.workRows],
  );
  const notationGridStyle = useMemo<DivisionNotationStyle>(
    () => ({
      "--division-column-count": renderModel.columnCount,
    }),
    [renderModel.columnCount],
  );
  const bringDownAnimationSourceByStepId = useMemo(
    () =>
      buildBringDownAnimationSourceByStepId({
        divisor,
        dividend,
        steps,
      }),
    [dividend, divisor, steps],
  );
  const activeBringDownAnimationSource = bringDownAnimationStepId
    ? bringDownAnimationSourceByStepId[bringDownAnimationStepId] ?? null
    : null;
  const activeStepKind = useMemo<LongDivisionStep["kind"] | "none">(() => {
    if (!renderModel.activeStepId) {
      return "none";
    }

    const activeStep = steps.find((step) => step.id === renderModel.activeStepId);
    return activeStep?.kind ?? "none";
  }, [renderModel.activeStepId, steps]);
  const activeStepFocus = renderModel.activeStepFocus;
  const activeStepFocusIdentity = useMemo(
    () =>
      [
        activeStepFocus.stepId ?? "",
        activeStepFocus.stepKind,
        activeStepFocus.workingValueText ?? "",
        activeStepFocus.workingDividendWindow?.startColumnIndex ?? "",
        activeStepFocus.workingDividendWindow?.endColumnIndex ?? "",
        activeStepFocus.quotientDigitText ?? "",
        activeStepFocus.multiplyValueText ?? "",
        activeStepFocus.subtractionValueText ?? "",
        activeStepFocus.bringDownDigitText ?? "",
        activeStepFocus.shouldHighlightDivisor ? "1" : "0",
        activeStepFocus.shouldHighlightWorkingDividend ? "1" : "0",
      ].join("|"),
    [activeStepFocus],
  );
  const stepById = useMemo(() => {
    const nextStepById = new Map<string, LongDivisionStep>();
    for (const step of steps) {
      nextStepById.set(step.id, step);
    }

    return nextStepById;
  }, [steps]);
  const activeEditableEntryLocator = useMemo<ActiveEditableEntryLocator | null>(() => {
    if (!liveTypingEnabled || !renderModel.activeStepId || !renderModel.activeTargetId) {
      return null;
    }
    if (retryLockedStepIds[renderModel.activeStepId]) {
      return null;
    }

    const activeQuotientCell = renderModel.quotientCells.find((cell) => cell.isActive);
    if (activeQuotientCell?.targetId) {
      return {
        stepId: activeQuotientCell.stepId,
        targetId: activeQuotientCell.targetId,
        digitIndex: 0,
      };
    }

    const activeWorkRow = renderModel.workRows.find((row) => row.isActive);
    if (!activeWorkRow || !activeWorkRow.targetId || activeWorkRow.kind === "bring-down") {
      return null;
    }

    const resolvedRowValue = resolveInlineWorkspaceEntryValue({
      stepId: activeWorkRow.stepId,
      lockedValue: activeWorkRow.value,
      isFilled: activeWorkRow.isFilled,
      draftEntryValues,
    });
    const expectedDigits = resolveExpectedStepDigits(
      stepById.get(activeWorkRow.stepId)?.expectedValue ?? activeWorkRow.value,
    );
    const resolvedDigitCount = Math.max(
      activeWorkRow.expectedDigitCount,
      expectedDigits.length,
      resolvedRowValue.length,
      1,
    );

    return {
      stepId: activeWorkRow.stepId,
      targetId: activeWorkRow.targetId,
      digitIndex: resolveActiveDigitIndex(resolvedRowValue, resolvedDigitCount),
    };
  }, [
    liveTypingEnabled,
    renderModel.activeStepId,
    renderModel.activeTargetId,
    renderModel.quotientCells,
    renderModel.workRows,
    draftEntryValues,
    stepById,
    retryLockedStepIds,
  ]);
  const activeEditableEntryIdentity = useMemo(
    () =>
      activeEditableEntryLocator
        ? `${activeEditableEntryLocator.stepId}|${activeEditableEntryLocator.targetId}|${activeEditableEntryLocator.digitIndex}`
        : "",
    [activeEditableEntryLocator],
  );

  const clearBringDownAnimationTimeout = useCallback(() => {
    if (!bringDownAnimationTimeoutRef.current) {
      return;
    }

    clearTimeout(bringDownAnimationTimeoutRef.current);
    bringDownAnimationTimeoutRef.current = null;
  }, []);

  const clearRowRevealAnimationTimeouts = useCallback(() => {
    const timeoutHandles = rowRevealTimeoutByStepIdRef.current;
    for (const timeoutHandle of timeoutHandles.values()) {
      clearTimeout(timeoutHandle);
    }
    timeoutHandles.clear();
  }, []);

  const clearEntryErrorPulseTimeouts = useCallback(() => {
    const timeoutHandles = errorPulseTimeoutByStepIdRef.current;
    for (const timeoutHandle of timeoutHandles.values()) {
      clearTimeout(timeoutHandle);
    }
    timeoutHandles.clear();
  }, []);

  const clearEntryRetryLockTimeouts = useCallback(() => {
    const timeoutHandles = retryLockTimeoutByStepIdRef.current;
    for (const timeoutHandle of timeoutHandles.values()) {
      clearTimeout(timeoutHandle);
    }
    timeoutHandles.clear();
  }, []);

  useEffect(() => {
    liveTypingStateRef.current = liveTypingState;
  }, [liveTypingState]);

  useEffect(() => {
    const timeoutHandles = lockTimeoutByStepIdRef.current;

    return () => {
      for (const timeoutHandle of timeoutHandles.values()) {
        clearTimeout(timeoutHandle);
      }
      timeoutHandles.clear();
      clearRowRevealAnimationTimeouts();
      clearBringDownAnimationTimeout();
      clearEntryErrorPulseTimeouts();
      clearEntryRetryLockTimeouts();
    };
  }, [
    clearBringDownAnimationTimeout,
    clearEntryErrorPulseTimeouts,
    clearEntryRetryLockTimeouts,
    clearRowRevealAnimationTimeouts,
  ]);

  useEffect(() => {
    if (!liveTypingEnabled || !activeEditableEntryLocator) {
      return;
    }

    const workspaceElement = workspaceRef.current;
    if (!workspaceElement) {
      return;
    }

    const activeEntrySelector = [
      `[data-entry-step-id="${activeEditableEntryLocator.stepId}"]`,
      `[data-entry-digit-index="${activeEditableEntryLocator.digitIndex}"]`,
      '[contenteditable="true"]',
    ].join("");

    const activeEntry =
      workspaceElement.querySelector<HTMLElement>(activeEntrySelector) ??
      workspaceElement.querySelector<HTMLElement>(
        `[data-entry-target-id="${activeEditableEntryLocator.targetId}"][contenteditable="true"]`,
      );
    if (!activeEntry) {
      return;
    }

    if (document.activeElement !== activeEntry) {
      activeEntry.focus();
    }
  }, [liveTypingEnabled, activeEditableEntryIdentity, activeEditableEntryLocator]);

  useEffect(() => {
    if (!onActiveStepFocusChange) {
      return;
    }

    if (lastActiveStepFocusIdentityRef.current === activeStepFocusIdentity) {
      return;
    }

    lastActiveStepFocusIdentityRef.current = activeStepFocusIdentity;
    onActiveStepFocusChange(activeStepFocus);
  }, [activeStepFocus, activeStepFocusIdentity, onActiveStepFocusChange]);

  useEffect(() => {
    clearBringDownAnimationTimeout();
    clearRowRevealAnimationTimeouts();
    clearEntryErrorPulseTimeouts();
    clearEntryRetryLockTimeouts();
  }, [
    clearBringDownAnimationTimeout,
    clearEntryErrorPulseTimeouts,
    clearEntryRetryLockTimeouts,
    clearRowRevealAnimationTimeouts,
    stepIdentity,
  ]);

  const clearBringDownAnimationState = useCallback(() => {
    setBringDownAnimationState((currentState) => {
      if (currentState.stepIdentity !== stepIdentity || currentState.stepId === null) {
        return currentState;
      }

      return {
        stepIdentity,
        stepId: null,
      };
    });
  }, [stepIdentity]);

  const queueLockInAnimation = useCallback((stepId: string) => {
    const timeoutKey = `${stepIdentity}:${stepId}`;

    setLockInAnimationState((currentState) => {
      const currentStepIds =
        currentState.stepIdentity === stepIdentity ? currentState.stepIds : {};

      return {
        stepIdentity,
        stepIds: {
          ...currentStepIds,
          [stepId]: true,
        },
      };
    });

    const existingTimeout = lockTimeoutByStepIdRef.current.get(timeoutKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeoutHandle = setTimeout(() => {
      setLockInAnimationState((currentState) => {
        const currentStepIds =
          currentState.stepIdentity === stepIdentity ? currentState.stepIds : {};
        if (!currentStepIds[stepId]) {
          return {
            stepIdentity,
            stepIds: currentStepIds,
          };
        }

        const nextStepIds = { ...currentStepIds };
        delete nextStepIds[stepId];
        return {
          stepIdentity,
          stepIds: nextStepIds,
        };
      });
      lockTimeoutByStepIdRef.current.delete(timeoutKey);
    }, LOCK_IN_ANIMATION_DURATION_MS);

    lockTimeoutByStepIdRef.current.set(timeoutKey, timeoutHandle);
  }, [stepIdentity]);

  const queueWorkRowRevealAnimation = useCallback((stepId: string) => {
    const timeoutKey = `${stepIdentity}:${stepId}`;

    setRowRevealAnimationState((currentState) => {
      const currentStepIds =
        currentState.stepIdentity === stepIdentity ? currentState.stepIds : {};

      return {
        stepIdentity,
        stepIds: {
          ...currentStepIds,
          [stepId]: true,
        },
      };
    });

    const existingTimeout = rowRevealTimeoutByStepIdRef.current.get(timeoutKey);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    const timeoutHandle = setTimeout(() => {
      setRowRevealAnimationState((currentState) => {
        const currentStepIds =
          currentState.stepIdentity === stepIdentity ? currentState.stepIds : {};
        if (!currentStepIds[stepId]) {
          return {
            stepIdentity,
            stepIds: currentStepIds,
          };
        }

        const nextStepIds = { ...currentStepIds };
        delete nextStepIds[stepId];
        return {
          stepIdentity,
          stepIds: nextStepIds,
        };
      });
      rowRevealTimeoutByStepIdRef.current.delete(timeoutKey);
    }, WORK_ROW_REVEAL_ANIMATION_DURATION_MS);

    rowRevealTimeoutByStepIdRef.current.set(timeoutKey, timeoutHandle);
  }, [stepIdentity]);

  const triggerEntryErrorFeedback = useCallback(
    (stepId: string) => {
      const timeoutKey = `${stepIdentity}:${stepId}`;
      const existingPulseTimeout = errorPulseTimeoutByStepIdRef.current.get(timeoutKey);
      const existingRetryLockTimeout = retryLockTimeoutByStepIdRef.current.get(timeoutKey);

      if (existingPulseTimeout) {
        clearTimeout(existingPulseTimeout);
      }

      if (existingRetryLockTimeout) {
        clearTimeout(existingRetryLockTimeout);
      }

      setEntryErrorPulseState((currentState) => {
        const currentStepIds =
          currentState.stepIdentity === stepIdentity ? currentState.stepIds : {};
        return {
          stepIdentity,
          stepIds: {
            ...currentStepIds,
            [stepId]: true,
          },
        };
      });

      setEntryRetryLockState((currentState) => {
        const currentStepIds =
          currentState.stepIdentity === stepIdentity ? currentState.stepIds : {};
        return {
          stepIdentity,
          stepIds: {
            ...currentStepIds,
            [stepId]: true,
          },
        };
      });

      const pulseTimeout = setTimeout(() => {
        setEntryErrorPulseState((currentState) => {
          const currentStepIds =
            currentState.stepIdentity === stepIdentity ? currentState.stepIds : {};
          if (!currentStepIds[stepId]) {
            return {
              stepIdentity,
              stepIds: currentStepIds,
            };
          }

          const nextStepIds = { ...currentStepIds };
          delete nextStepIds[stepId];
          return {
            stepIdentity,
            stepIds: nextStepIds,
          };
        });
        errorPulseTimeoutByStepIdRef.current.delete(timeoutKey);
      }, ENTRY_ERROR_PULSE_DURATION_MS);

      const retryLockTimeout = setTimeout(() => {
        setEntryRetryLockState((currentState) => {
          const currentStepIds =
            currentState.stepIdentity === stepIdentity ? currentState.stepIds : {};
          if (!currentStepIds[stepId]) {
            return {
              stepIdentity,
              stepIds: currentStepIds,
            };
          }

          const nextStepIds = { ...currentStepIds };
          delete nextStepIds[stepId];
          return {
            stepIdentity,
            stepIds: nextStepIds,
          };
        });
        retryLockTimeoutByStepIdRef.current.delete(timeoutKey);
      }, ENTRY_RETRY_LOCK_DURATION_MS);

      errorPulseTimeoutByStepIdRef.current.set(timeoutKey, pulseTimeout);
      retryLockTimeoutByStepIdRef.current.set(timeoutKey, retryLockTimeout);
    },
    [stepIdentity],
  );

  const applyCommittedTransition = useCallback(
    (transition: LiveWorkspaceEntryInputTransition) => {
      liveTypingStateRef.current = transition.state;
      setLiveTypingRuntimeState({
        stepIdentity,
        state: transition.state,
      });

      if (transition.validation) {
        onStepValidation?.(transition.validation);
      }

      if (transition.lockedStepId) {
        queueLockInAnimation(transition.lockedStepId);
      }
    },
    [onStepValidation, queueLockInAnimation, stepIdentity],
  );

  const queueBringDownAnimationForStep = useCallback(
    (stepId: string) => {
      setBringDownAnimationState({
        stepIdentity,
        stepId,
      });

      clearBringDownAnimationTimeout();

      bringDownAnimationTimeoutRef.current = setTimeout(() => {
        clearBringDownAnimationState();

        const transition = tryAutoAdvanceBringDownStep({
          steps,
          state: liveTypingStateRef.current,
          validateStep: validateLongDivisionStepAnswer,
        });
        if (transition) {
          applyCommittedTransition(transition);
        }

        bringDownAnimationTimeoutRef.current = null;
      }, BRING_DOWN_ANIMATION_DURATION_MS);
    },
    [
      applyCommittedTransition,
      clearBringDownAnimationState,
      clearBringDownAnimationTimeout,
      stepIdentity,
      steps,
    ],
  );

  const commitLiveWorkspaceTransition = useCallback(
    (transition: LiveWorkspaceEntryInputTransition) => {
      const previousRevealedStepCount = liveTypingStateRef.current.revealedStepCount;
      applyCommittedTransition(transition);

      if (!liveTypingEnabled || !transition.didAdvance || !transition.validation) {
        clearBringDownAnimationTimeout();
        clearBringDownAnimationState();
        return;
      }

      const focusStepIndex = transition.validation.focusStepIndex;
      const nextStep = typeof focusStepIndex === "number" ? steps[focusStepIndex] : null;
      const didRevealNextStep = transition.state.revealedStepCount > previousRevealedStepCount;

      if (didRevealNextStep && nextStep && nextStep.kind !== "quotient-digit") {
        queueWorkRowRevealAnimation(nextStep.id);
      }

      if (nextStep?.kind === "bring-down") {
        queueBringDownAnimationForStep(nextStep.id);
        return;
      }

      clearBringDownAnimationTimeout();
      clearBringDownAnimationState();
    },
    [
      applyCommittedTransition,
      clearBringDownAnimationState,
      clearBringDownAnimationTimeout,
      liveTypingEnabled,
      queueBringDownAnimationForStep,
      queueWorkRowRevealAnimation,
      steps,
    ],
  );

  const applyInlineEntryTransition = useCallback(
    (stepId: string, rawValue: string) => {
      if (!liveTypingEnabled) {
        return;
      }

      const transition = applyLiveWorkspaceEntryInput({
        steps,
        state: liveTypingStateRef.current,
        stepId,
        rawValue,
        validateStep: validateLongDivisionStepAnswer,
      });

      commitLiveWorkspaceTransition(transition);
    },
    [commitLiveWorkspaceTransition, liveTypingEnabled, steps],
  );

  const applyStepDigitPrefixTransition = useCallback(
    (stepId: string, expectedDigits: readonly string[], prefixLength: number) => {
      const boundedPrefixLength = Math.min(
        Math.max(Math.trunc(prefixLength), 0),
        expectedDigits.length,
      );
      const nextValue = expectedDigits.slice(0, boundedPrefixLength).join("");
      applyInlineEntryTransition(stepId, nextValue);
    },
    [applyInlineEntryTransition],
  );

  const handleInlineDigitInput = useCallback(
    ({ stepId, expectedDigits, activeDigitIndex }: InlineDigitCellContext, event: FormEvent<HTMLSpanElement>) => {
      if (expectedDigits.length === 0) {
        event.currentTarget.textContent = "";
        return;
      }

      const currentText = event.currentTarget.textContent ?? "";
      const nextDigit = sanitizeInlineWorkspaceEntryValue(currentText).at(-1) ?? "";
      const expectedDigit = expectedDigits[activeDigitIndex] ?? "";
      event.currentTarget.textContent = "";

      if (nextDigit.length === 0) {
        return;
      }

      if (nextDigit !== expectedDigit) {
        triggerEntryErrorFeedback(stepId);
        return;
      }

      applyStepDigitPrefixTransition(stepId, expectedDigits, activeDigitIndex + 1);
    },
    [applyStepDigitPrefixTransition, triggerEntryErrorFeedback],
  );

  const handleInlineDigitKeyDown = useCallback(
    ({ stepId, expectedDigits, activeDigitIndex }: InlineDigitCellContext, event: KeyboardEvent<HTMLSpanElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        if (activeDigitIndex > 0) {
          applyStepDigitPrefixTransition(stepId, expectedDigits, activeDigitIndex - 1);
        }
        return;
      }

      if (event.key.length === 1 && NON_DIGIT_KEY_PATTERN.test(event.key)) {
        event.preventDefault();
      }
    },
    [applyStepDigitPrefixTransition],
  );

  const handleInlineDigitPaste = useCallback(
    ({ stepId, expectedDigits, activeDigitIndex }: InlineDigitCellContext, event: ClipboardEvent<HTMLSpanElement>) => {
      event.preventDefault();

      if (expectedDigits.length === 0) {
        event.currentTarget.textContent = "";
        return;
      }

      const pastedDigits = sanitizeInlineWorkspaceEntryValue(
        event.clipboardData.getData("text"),
      );
      event.currentTarget.textContent = "";

      let acceptedDigitCount = 0;
      for (
        let pastedIndex = 0;
        pastedIndex < pastedDigits.length && activeDigitIndex + acceptedDigitCount < expectedDigits.length;
        pastedIndex += 1
      ) {
        const expectedDigit = expectedDigits[activeDigitIndex + acceptedDigitCount];
        if (pastedDigits[pastedIndex] !== expectedDigit) {
          break;
        }

        acceptedDigitCount += 1;
      }

      if (acceptedDigitCount === 0) {
        if (pastedDigits.length > 0) {
          triggerEntryErrorFeedback(stepId);
        }
        return;
      }

      applyStepDigitPrefixTransition(
        stepId,
        expectedDigits,
        activeDigitIndex + acceptedDigitCount,
      );
    },
    [applyStepDigitPrefixTransition, triggerEntryErrorFeedback],
  );

  return (
    <article
      aria-label="Long-division workspace"
      className="workspace-paper bus-stop-renderer"
      data-active-step-kind={activeStepKind}
      data-bring-down-animation={bringDownAnimationStepId ? "running" : "idle"}
      data-ui-component="bus-stop-renderer"
      data-workspace-live-typing={liveTypingEnabled ? "enabled" : "disabled"}
      ref={workspaceRef}
    >
      <p className="workspace-label">Quotient</p>
      <div className="bus-stop-notation" style={notationGridStyle}>
        <div className="quotient-row">
          <span aria-hidden="true" className="quotient-row-spacer">
            {renderModel.divisorText}
          </span>
          <div className="quotient-track">
            {renderModel.quotientCells.map((cell) => {
              const resolvedCellValue = resolveInlineWorkspaceEntryValue({
                stepId: cell.stepId,
                lockedValue: cell.value,
                isFilled: cell.isFilled,
                draftEntryValues,
              });
              const expectedDigits = resolveExpectedStepDigits(
                stepById.get(cell.stepId)?.expectedValue ?? cell.value,
              );
              const activeDigitIndex = resolveActiveDigitIndex(
                resolvedCellValue,
                Math.max(expectedDigits.length, 1),
              );
              const digitInputContext: InlineDigitCellContext = {
                stepId: cell.stepId,
                expectedDigits,
                activeDigitIndex,
              };
              const isCellRetryLocked = Boolean(retryLockedStepIds[cell.stepId]);
              const isCellErrorPulse = Boolean(errorPulseStepIds[cell.stepId]);

              return (
                <WorkspaceInlineEntry
                  digitIndex={0}
                  isErrorPulse={isCellErrorPulse}
                  isActive={cell.isActive && activeDigitIndex === 0}
                  isAutoEntry={false}
                  isFilled={cell.isFilled}
                  isInteractive={
                    liveTypingEnabled &&
                    cell.isActive &&
                    activeDigitIndex === 0 &&
                    !isCellRetryLocked
                  }
                  isLockingIn={Boolean(lockingStepIds[cell.stepId])}
                  isRetryLocked={isCellRetryLocked}
                  key={cell.stepId}
                  lane="quotient"
                  onInput={
                    liveTypingEnabled
                      ? (event) => handleInlineDigitInput(digitInputContext, event)
                      : undefined
                  }
                  onKeyDown={
                    liveTypingEnabled
                      ? (event) => handleInlineDigitKeyDown(digitInputContext, event)
                      : undefined
                  }
                  onPaste={
                    liveTypingEnabled
                      ? (event) => handleInlineDigitPaste(digitInputContext, event)
                      : undefined
                  }
                  stepKind="quotient-digit"
                  stepId={cell.stepId}
                  style={{ gridColumnStart: cell.columnIndex + 1 }}
                  targetId={cell.targetId}
                  value={resolvedCellValue.slice(0, 1)}
                />
              );
            })}
          </div>
        </div>

        <div className="bus-stop-core">
          <p
            className={`divisor-cell${activeStepFocus.shouldHighlightDivisor ? " context-value-glow" : ""}`}
            data-step-focus={activeStepFocus.shouldHighlightDivisor ? "active" : "idle"}
            data-step-focus-kind={activeStepFocus.shouldHighlightDivisor ? activeStepFocus.stepKind : "none"}
          >
            {renderModel.divisorText}
          </p>
          <div className="bracket-stack">
            <p className="dividend-line" data-bring-down-source-step-id={bringDownAnimationStepId ?? ""}>
              {dividendDigits.map((digit, digitIndex) => {
                const isBringDownSourceDigit =
                  activeBringDownAnimationSource?.sourceDividendDigitIndex === digitIndex;
                const isStepFocusedDigit =
                  activeStepFocus.shouldHighlightWorkingDividend &&
                  activeStepFocus.workingDividendWindow !== null &&
                  digitIndex >= activeStepFocus.workingDividendWindow.startColumnIndex &&
                  digitIndex <= activeStepFocus.workingDividendWindow.endColumnIndex;

                return (
                  <span
                    className={`dividend-digit${isBringDownSourceDigit ? " dividend-digit-bring-down-origin" : ""}${isStepFocusedDigit ? " context-value-glow" : ""}`}
                    data-bring-down-origin={isBringDownSourceDigit ? "active" : "idle"}
                    data-dividend-digit-index={digitIndex}
                    data-step-focus={isStepFocusedDigit ? "active" : "idle"}
                    data-step-focus-kind={isStepFocusedDigit ? activeStepFocus.stepKind : "none"}
                    key={`dividend-digit-${digitIndex}`}
                  >
                    {digit}
                  </span>
                );
              })}
            </p>

            <ol className="work-rows">
              {collapsedWorkRows.length === 0 ? (
                <li className="work-row work-row-placeholder">
                  <span aria-hidden="true" className="work-row-op">
                    &nbsp;
                  </span>
                  <span className="work-row-value">...</span>
                </li>
              ) : (
                collapsedWorkRows.map(({ row, bringDownCompanion }) => {
                  const isRowTransitioning =
                    Boolean(rowRevealStepIds[row.stepId]) ||
                    Boolean(bringDownCompanion && rowRevealStepIds[bringDownCompanion.stepId]);
                  const resolvedRowValue = resolveInlineWorkspaceEntryValue({
                    stepId: row.stepId,
                    lockedValue: row.value,
                    isFilled: row.isFilled,
                    draftEntryValues,
                  });
                  const expectedRowValue = row.kind === "bring-down"
                    ? row.value
                    : stepById.get(row.stepId)?.expectedValue ?? row.value;
                  const expectedDigits = resolveExpectedStepDigits(
                    expectedRowValue,
                  );
                  const resolvedDigitCount = Math.max(
                    row.expectedDigitCount,
                    expectedDigits.length,
                    resolvedRowValue.length,
                    1,
                  );
                  const rowDigits = Array.from(resolvedRowValue);
                  const activeDigitIndex = resolveActiveDigitIndex(
                    resolvedRowValue,
                    resolvedDigitCount,
                  );
                  const isAutoEntryRow = row.kind === "bring-down" && liveTypingEnabled;
                  const isRowRetryLocked = Boolean(retryLockedStepIds[row.stepId]);
                  const isRowErrorPulse = Boolean(errorPulseStepIds[row.stepId]);
                  const primaryValueEndColumn = row.columnIndex + 1;
                  const primaryValueStartColumn = Math.max(
                    primaryValueEndColumn - resolvedDigitCount + 1,
                    1,
                  );
                  const companionColumnIndex = bringDownCompanion
                    ? bringDownCompanion.columnIndex + 1
                    : null;
                  const workValueStartColumn =
                    companionColumnIndex === null
                      ? primaryValueStartColumn
                      : Math.min(primaryValueStartColumn, companionColumnIndex);
                  const workValueEndColumn =
                    companionColumnIndex === null
                      ? primaryValueEndColumn
                      : Math.max(primaryValueEndColumn, companionColumnIndex);
                  const workValueColumnSpan = Math.max(
                    workValueEndColumn - workValueStartColumn + 1,
                    1,
                  );
                  const primaryColumnOffset = primaryValueStartColumn - workValueStartColumn;
                  const workRowValueShellStyle: DivisionNotationStyle = {
                    "--work-value-start-column": workValueStartColumn,
                    "--work-value-column-span": workValueColumnSpan,
                  };
                  const bringDownResolvedValue = bringDownCompanion
                    ? resolveInlineWorkspaceEntryValue({
                        stepId: bringDownCompanion.stepId,
                        lockedValue: bringDownCompanion.value,
                        isFilled: bringDownCompanion.isFilled,
                        draftEntryValues,
                      })
                    : "";
                  const isBringDownAnimationRunning =
                    bringDownCompanion?.stepId === bringDownAnimationStepId;

                  return (
                    <li
                      className={`work-row${isRowTransitioning ? " work-row-enter" : ""}`}
                      data-row-transition={isRowTransitioning ? "enter" : "idle"}
                      data-step-kind={row.kind}
                      key={row.stepId}
                    >
                      <span aria-hidden="true" className="work-row-op">
                        {row.displayPrefix || "\u00a0"}
                      </span>
                      <div
                        className="work-row-value-shell"
                        data-bring-down-animation={isBringDownAnimationRunning ? "running" : "idle"}
                        style={workRowValueShellStyle}
                      >
                        {Array.from({ length: resolvedDigitCount }, (_, digitIndex) => {
                          const digitInputContext: InlineDigitCellContext = {
                            stepId: row.stepId,
                            expectedDigits,
                            activeDigitIndex,
                          };
                          const isResolvedDigitFilled = digitIndex < rowDigits.length;
                          const isFocusedPendingDigit =
                            row.isActive && !row.isFilled && digitIndex === activeDigitIndex;

                          return (
                            <WorkspaceInlineEntry
                              digitIndex={digitIndex}
                              isErrorPulse={isRowErrorPulse && digitIndex === activeDigitIndex}
                              isActive={row.isActive && digitIndex === activeDigitIndex}
                              isAutoEntry={isAutoEntryRow}
                              isFilled={row.isFilled || isResolvedDigitFilled}
                              isInteractive={
                                liveTypingEnabled &&
                                isFocusedPendingDigit &&
                                !isRowRetryLocked
                              }
                              isLockingIn={Boolean(lockingStepIds[row.stepId])}
                              isRetryLocked={isRowRetryLocked && digitIndex === activeDigitIndex}
                              key={`${row.stepId}:digit:${digitIndex}`}
                              lane="work-row"
                              onInput={
                                liveTypingEnabled
                                  ? (event) => handleInlineDigitInput(digitInputContext, event)
                                  : undefined
                              }
                              onKeyDown={
                                liveTypingEnabled
                                  ? (event) => handleInlineDigitKeyDown(digitInputContext, event)
                                  : undefined
                              }
                              onPaste={
                                liveTypingEnabled
                                  ? (event) => handleInlineDigitPaste(digitInputContext, event)
                                  : undefined
                              }
                              stepId={row.stepId}
                              stepKind={row.kind}
                              style={{
                                gridColumnStart: primaryColumnOffset + digitIndex + 1,
                              }}
                              targetId={row.targetId}
                              value={rowDigits[digitIndex] ?? ""}
                            />
                          );
                        })}
                        {bringDownCompanion && companionColumnIndex !== null ? (
                          <WorkspaceInlineEntry
                            digitIndex={0}
                            isErrorPulse={Boolean(errorPulseStepIds[bringDownCompanion.stepId])}
                            isActive={bringDownCompanion.isActive}
                            isAutoEntry={liveTypingEnabled}
                            isFilled={bringDownCompanion.isFilled}
                            isInteractive={false}
                            isLockingIn={Boolean(lockingStepIds[bringDownCompanion.stepId])}
                            isRetryLocked={Boolean(retryLockedStepIds[bringDownCompanion.stepId])}
                            key={`${bringDownCompanion.stepId}:digit:0`}
                            lane="work-row"
                            stepId={bringDownCompanion.stepId}
                            stepKind={bringDownCompanion.kind}
                            style={{
                              gridColumnStart:
                                companionColumnIndex - workValueStartColumn + 1,
                            }}
                            targetId={bringDownCompanion.targetId}
                            value={bringDownResolvedValue}
                          />
                        ) : null}
                        {isBringDownAnimationRunning ? (
                          <span aria-hidden="true" className="bring-down-digit-slide">
                            {activeBringDownAnimationSource?.digit ?? "\u00a0"}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })
              )}
            </ol>
          </div>
        </div>
      </div>
    </article>
  );
}
