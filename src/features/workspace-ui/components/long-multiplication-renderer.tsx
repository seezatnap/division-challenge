"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import type { LongMultiplicationStep } from "@/features/contracts";
import {
  validateLongDivisionStepAnswer,
  type LongDivisionStepValidationResult,
} from "@/features/division-engine/lib/step-validation";
import {
  applyLiveWorkspaceEntryInput,
  buildMultiplicationRenderModel,
  createLiveWorkspaceTypingState,
  playWorkspaceSoundEffect,
  type LiveWorkspaceTypingState,
  type MultiplicationActiveStepFocus,
  type MultiplicationDecimalPointSlot,
  type MultiplicationWorkRow,
} from "@/features/workspace-ui/lib";

const LOCK_IN_ANIMATION_DURATION_MS = 280;
const ENTRY_ERROR_PULSE_DURATION_MS = 360;
const ENTRY_RETRY_LOCK_DURATION_MS = 1000;
const NON_DIGIT_KEY_PATTERN = /^\D$/;

export interface LongMultiplicationRendererProps {
  multiplicand: number;
  multiplier: number;
  /** Decimal places in the multiplicand; defaults to a whole number. */
  multiplicandDecimalPlaces?: number;
  /** Decimal places in the multiplier; defaults to a whole number. */
  multiplierDecimalPlaces?: number;
  steps: readonly LongMultiplicationStep[];
  onStepValidation?: (validation: LongDivisionStepValidationResult) => void;
  onActiveStepFocusChange?: (focus: MultiplicationActiveStepFocus) => void;
}

type MultiplicationNotationStyle = CSSProperties & {
  "--mult-column-count"?: number;
};

interface MultiplicationEntryCellProps {
  stepId: string;
  stepKind: LongMultiplicationStep["kind"];
  targetId: string | null;
  digitIndex: number;
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

function buildEntryClassName({
  isFilled,
  isActive,
  isLockingIn,
  isErrorPulse,
  isRetryLocked,
}: Pick<
  MultiplicationEntryCellProps,
  "isFilled" | "isActive" | "isLockingIn" | "isErrorPulse" | "isRetryLocked"
>): string {
  const classes = [
    "inline-entry",
    "inline-entry-work-row",
    "work-row-value",
    isFilled ? "inline-entry-locked" : "inline-entry-pending",
    isActive ? "inline-entry-active glow-amber" : "",
    isLockingIn ? "inline-entry-lock-in" : "",
    isErrorPulse ? "inline-entry-error-pulse" : "",
    isRetryLocked ? "inline-entry-retry-lock" : "",
  ];

  return classes.filter(Boolean).join(" ");
}

function MultiplicationEntryCell({
  stepId,
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
}: MultiplicationEntryCellProps) {
  const isEditable = isInteractive && !isFilled && !isAutoEntry && !isRetryLocked && Boolean(targetId);

  return (
    <span
      aria-label={isEditable ? "Inline workspace entry" : undefined}
      aria-invalid={isErrorPulse ? true : undefined}
      className={buildEntryClassName({
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
      data-entry-lane="work-row"
      data-entry-live={isInteractive ? "true" : "false"}
      data-entry-lock-pulse={isLockingIn ? stepKind : "none"}
      data-entry-step-kind={stepKind}
      data-entry-step-id={stepId}
      data-entry-state={isFilled ? "locked" : "pending"}
      data-glow-cadence={isActive ? stepKind : "none"}
      data-entry-target-id={targetId ?? ""}
      data-entry-digit-index={String(digitIndex)}
      onInput={isEditable ? onInput : undefined}
      onKeyDown={isEditable ? onKeyDown : undefined}
      onPaste={isEditable ? onPaste : undefined}
      role={isEditable ? "textbox" : undefined}
      spellCheck={false}
      style={style}
      suppressContentEditableWarning={isEditable}
      tabIndex={isEditable ? 0 : undefined}
    >
      {value.length > 0 ? value : " "}
    </span>
  );
}

function toDecimalSlotFlagKey(stepId: string, decimalPlaces: number): string {
  return `${stepId}:decimal-slot:${decimalPlaces}`;
}

function describeDecimalSlot(decimalPlaces: number, productDigitCount: number): string {
  if (decimalPlaces === productDigitCount) {
    return "Place the decimal point before the first digit";
  }

  return `Place the decimal point with ${decimalPlaces} ${
    decimalPlaces === 1 ? "digit" : "digits"
  } after it`;
}

export function LongMultiplicationRenderer({
  multiplicand,
  multiplier,
  multiplicandDecimalPlaces = 0,
  multiplierDecimalPlaces = 0,
  steps,
  onStepValidation,
  onActiveStepFocusChange,
}: LongMultiplicationRendererProps) {
  const stepIdentity = useMemo(() => steps.map((step) => step.id).join("|"), [steps]);
  const [liveTypingRuntimeState, setLiveTypingRuntimeState] = useState<{
    stepIdentity: string;
    state: LiveWorkspaceTypingState;
  }>(() => ({
    stepIdentity,
    state: createLiveWorkspaceTypingState({ stepCount: steps.length, revealedStepCount: 0 }),
  }));
  const liveTypingState =
    liveTypingRuntimeState.stepIdentity === stepIdentity
      ? liveTypingRuntimeState.state
      : createLiveWorkspaceTypingState({ stepCount: steps.length, revealedStepCount: 0 });
  const liveTypingStateRef = useRef<LiveWorkspaceTypingState>(liveTypingState);
  const [animationFlags, setAnimationFlags] = useState<{
    stepIdentity: string;
    lockingStepIds: Record<string, true>;
    errorPulseStepIds: Record<string, true>;
    retryLockedStepIds: Record<string, true>;
  }>({
    stepIdentity,
    lockingStepIds: {},
    errorPulseStepIds: {},
    retryLockedStepIds: {},
  });
  const lockingStepIds =
    animationFlags.stepIdentity === stepIdentity ? animationFlags.lockingStepIds : {};
  const errorPulseStepIds =
    animationFlags.stepIdentity === stepIdentity ? animationFlags.errorPulseStepIds : {};
  const retryLockedStepIds =
    animationFlags.stepIdentity === stepIdentity ? animationFlags.retryLockedStepIds : {};
  const animationTimeoutsRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const lastActiveStepFocusIdentityRef = useRef<string | null>(null);
  const workspaceRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    liveTypingStateRef.current = liveTypingState;
  }, [liveTypingState]);

  useEffect(() => {
    const timeoutHandles = animationTimeoutsRef.current;

    return () => {
      for (const timeoutHandle of timeoutHandles) {
        clearTimeout(timeoutHandle);
      }
      timeoutHandles.clear();
    };
  }, []);

  const renderModel = useMemo(
    () =>
      buildMultiplicationRenderModel({
        multiplicand,
        multiplier,
        multiplicandDecimalPlaces,
        multiplierDecimalPlaces,
        steps,
        revealedStepCount: liveTypingState.revealedStepCount,
      }),
    [
      multiplicand,
      multiplier,
      multiplicandDecimalPlaces,
      multiplierDecimalPlaces,
      steps,
      liveTypingState.revealedStepCount,
    ],
  );
  const stepById = useMemo(() => {
    const nextStepById = new Map<string, LongMultiplicationStep>();
    for (const step of steps) {
      nextStepById.set(step.id, step);
    }

    return nextStepById;
  }, [steps]);
  const notationGridStyle = useMemo<MultiplicationNotationStyle>(
    () => ({
      "--mult-column-count": renderModel.columnCount,
    }),
    [renderModel.columnCount],
  );
  const multiplicandDigits = useMemo(
    () => Array.from(renderModel.multiplicandText),
    [renderModel.multiplicandText],
  );
  const multiplierDigits = useMemo(
    () => Array.from(renderModel.multiplierText),
    [renderModel.multiplierText],
  );
  const activeStepKind = useMemo<LongMultiplicationStep["kind"] | "none">(() => {
    if (!renderModel.activeStepId) {
      return "none";
    }

    return stepById.get(renderModel.activeStepId)?.kind ?? "none";
  }, [renderModel.activeStepId, stepById]);
  const activeStepFocus = renderModel.activeStepFocus;
  const activeStepFocusIdentity = useMemo(
    () =>
      [
        activeStepFocus.stepId ?? "",
        activeStepFocus.stepKind,
        activeStepFocus.multiplierDigitText ?? "",
        activeStepFocus.shiftZeroCount,
      ].join("|"),
    [activeStepFocus],
  );

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

  const scheduleAnimationFlag = useCallback(
    (
      flagKey: "lockingStepIds" | "errorPulseStepIds" | "retryLockedStepIds",
      stepId: string,
      durationMs: number,
    ) => {
      setAnimationFlags((currentFlags) => {
        const baseFlags =
          currentFlags.stepIdentity === stepIdentity
            ? currentFlags
            : {
                stepIdentity,
                lockingStepIds: {},
                errorPulseStepIds: {},
                retryLockedStepIds: {},
              };

        return {
          ...baseFlags,
          stepIdentity,
          [flagKey]: {
            ...baseFlags[flagKey],
            [stepId]: true,
          },
        };
      });

      const timeoutHandle = setTimeout(() => {
        animationTimeoutsRef.current.delete(timeoutHandle);
        setAnimationFlags((currentFlags) => {
          if (currentFlags.stepIdentity !== stepIdentity || !currentFlags[flagKey][stepId]) {
            return currentFlags;
          }

          const nextFlagValues = { ...currentFlags[flagKey] };
          delete nextFlagValues[stepId];
          return {
            ...currentFlags,
            [flagKey]: nextFlagValues,
          };
        });
      }, durationMs);

      animationTimeoutsRef.current.add(timeoutHandle);
    },
    [stepIdentity],
  );

  const triggerEntryErrorFeedback = useCallback(
    (stepId: string) => {
      playWorkspaceSoundEffect("digit-error");
      scheduleAnimationFlag("errorPulseStepIds", stepId, ENTRY_ERROR_PULSE_DURATION_MS);
      scheduleAnimationFlag("retryLockedStepIds", stepId, ENTRY_RETRY_LOCK_DURATION_MS);
    },
    [scheduleAnimationFlag],
  );

  const applySuffixTransition = useCallback(
    (stepId: string, nextSuffix: string) => {
      const transition = applyLiveWorkspaceEntryInput({
        steps,
        state: liveTypingStateRef.current,
        stepId,
        rawValue: nextSuffix,
        validateStep: validateLongDivisionStepAnswer,
      });

      liveTypingStateRef.current = transition.state;
      setLiveTypingRuntimeState({
        stepIdentity,
        state: transition.state,
      });

      if (transition.validation) {
        onStepValidation?.(transition.validation);
      }

      if (transition.lockedStepId) {
        playWorkspaceSoundEffect(
          transition.state.revealedStepCount >= steps.length ? "problem-complete" : "step-lock-in",
        );
        scheduleAnimationFlag(
          "lockingStepIds",
          transition.lockedStepId,
          LOCK_IN_ANIMATION_DURATION_MS,
        );
      }
    },
    [onStepValidation, scheduleAnimationFlag, stepIdentity, steps],
  );

  const handleDigitInput = useCallback(
    (row: MultiplicationWorkRow, typedSuffix: string, event: FormEvent<HTMLSpanElement>) => {
      const expectedValue = stepById.get(row.stepId)?.expectedValue ?? "";
      const currentText = event.currentTarget.textContent ?? "";
      const nextDigit = currentText.replace(/\D+/g, "").at(-1) ?? "";
      event.currentTarget.textContent = "";

      if (nextDigit.length === 0 || expectedValue.length === 0) {
        return;
      }

      const expectedDigit = expectedValue[expectedValue.length - 1 - typedSuffix.length] ?? "";

      if (nextDigit !== expectedDigit) {
        triggerEntryErrorFeedback(row.stepId);
        return;
      }

      playWorkspaceSoundEffect("digit-correct");
      applySuffixTransition(
        row.stepId,
        expectedValue.slice(expectedValue.length - typedSuffix.length - 1),
      );
    },
    [applySuffixTransition, stepById, triggerEntryErrorFeedback],
  );

  const handleDigitKeyDown = useCallback(
    (row: MultiplicationWorkRow, typedSuffix: string, event: KeyboardEvent<HTMLSpanElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        return;
      }

      if (event.key === "Backspace") {
        event.preventDefault();
        if (typedSuffix.length > 0) {
          applySuffixTransition(row.stepId, typedSuffix.slice(1));
        }
        return;
      }

      if (event.key.length === 1 && NON_DIGIT_KEY_PATTERN.test(event.key)) {
        event.preventDefault();
      }
    },
    [applySuffixTransition],
  );

  const handleDigitPaste = useCallback((event: ClipboardEvent<HTMLSpanElement>) => {
    event.preventDefault();
  }, []);

  const decimalPoint = renderModel.decimalPoint;
  const isDecimalStepRetryLocked = decimalPoint
    ? Boolean(retryLockedStepIds[decimalPoint.stepId])
    : false;

  const handleDecimalSlotClick = useCallback(
    (slot: MultiplicationDecimalPointSlot) => {
      if (!decimalPoint || !decimalPoint.isActive || isDecimalStepRetryLocked) {
        return;
      }

      if (slot.decimalPlaces !== decimalPoint.expectedDecimalPlaces) {
        // Mirror the digit flow: a wrong tap shakes the tapped slot, plays the
        // error cue, and briefly locks the whole step before another try.
        const slotFlagKey = toDecimalSlotFlagKey(decimalPoint.stepId, slot.decimalPlaces);
        playWorkspaceSoundEffect("digit-error");
        scheduleAnimationFlag("errorPulseStepIds", slotFlagKey, ENTRY_ERROR_PULSE_DURATION_MS);
        scheduleAnimationFlag("retryLockedStepIds", slotFlagKey, ENTRY_RETRY_LOCK_DURATION_MS);
        scheduleAnimationFlag(
          "retryLockedStepIds",
          decimalPoint.stepId,
          ENTRY_RETRY_LOCK_DURATION_MS,
        );
        return;
      }

      playWorkspaceSoundEffect("digit-correct");
      applySuffixTransition(decimalPoint.stepId, String(slot.decimalPlaces));
    },
    [applySuffixTransition, decimalPoint, isDecimalStepRetryLocked, scheduleAnimationFlag],
  );

  const renderLeadingZero = (
    position: { leadingZeroColumn: number | null } | null,
    trackName: "multiplicand" | "multiplier" | "product",
  ) => {
    if (!position || position.leadingZeroColumn === null) {
      return null;
    }

    return (
      <span
        className="mult-static-digit mult-leading-zero"
        data-mult-leading-zero={trackName}
        style={{ gridRowStart: 1, gridColumnStart: position.leadingZeroColumn }}
      >
        0
      </span>
    );
  };

  const renderStaticDecimalPoint = (
    position: { column: number; leadingZeroColumn: number | null } | null,
    trackName: "multiplicand" | "multiplier",
  ) => {
    if (!position) {
      return null;
    }

    const shouldGlow = activeStepFocus.stepKind === "decimal-point";

    return (
      <>
        {renderLeadingZero(position, trackName)}
        <span
          aria-hidden="true"
          className={`mult-decimal-point mult-factor-decimal-point${
            shouldGlow ? " context-value-glow" : ""
          }`}
          data-mult-decimal-point={trackName}
          data-step-focus={shouldGlow ? "active" : "idle"}
          data-step-focus-kind={shouldGlow ? activeStepFocus.stepKind : "none"}
          style={{ gridRowStart: 1, gridColumnStart: position.column }}
        >
          <span className="mult-decimal-point-dot" />
        </span>
      </>
    );
  };

  const activeRow = renderModel.workRows.find((row) => row.isActive) ?? null;
  const activeRowSuffix = activeRow
    ? liveTypingState.draftEntryValues[activeRow.stepId] ?? ""
    : "";
  const activeDigitIndex = activeRow
    ? Math.max(activeRow.expectedDigitCount - 1 - activeRowSuffix.length, 0)
    : 0;
  const activeEntryIdentity = activeRow
    ? `${activeRow.stepId}|${activeDigitIndex}|${Boolean(retryLockedStepIds[activeRow.stepId])}`
    : "";

  useEffect(() => {
    if (!activeRow || retryLockedStepIds[activeRow.stepId]) {
      return;
    }

    const workspaceElement = workspaceRef.current;
    if (!workspaceElement) {
      return;
    }

    const activeEntry = workspaceElement.querySelector<HTMLElement>(
      `[data-entry-step-id="${activeRow.stepId}"][data-entry-digit-index="${activeDigitIndex}"][contenteditable="true"]`,
    );
    if (activeEntry && document.activeElement !== activeEntry) {
      activeEntry.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEntryIdentity]);

  return (
    <article
      aria-label="Long-multiplication workspace"
      className="workspace-paper mult-renderer"
      data-active-step-kind={activeStepKind}
      data-ui-component="long-multiplication-renderer"
      data-workspace-live-typing="enabled"
      ref={workspaceRef}
    >
      <p className="workspace-label">Product</p>
      <div className="mult-notation" style={notationGridStyle}>
        <div className="mult-statement">
          <p aria-hidden="true" className="mult-statement-row mult-carry-row" data-mult-row="carries">
            <span className="mult-row-op"> </span>
            <span className="mult-digit-track">
              {activeStepFocus.carryDigits.map((carryDigit, positionFromRight) => {
                const isCarryRevealed =
                  activeStepFocus.stepKind === "partial-product" &&
                  carryDigit > 0 &&
                  activeRowSuffix.length >= positionFromRight;

                if (!isCarryRevealed) {
                  return null;
                }

                return (
                  <span
                    className="mult-carry-digit"
                    data-mult-carry="visible"
                    key={`carry-${positionFromRight}`}
                    style={{
                      gridRowStart: 1,
                      gridColumnStart: renderModel.columnCount - positionFromRight,
                    }}
                  >
                    {carryDigit}
                  </span>
                );
              })}
            </span>
          </p>
          <p className="mult-statement-row" data-mult-row="multiplicand">
            <span aria-hidden="true" className="mult-row-op">
              {" "}
            </span>
            <span className="mult-digit-track">
              {multiplicandDigits.map((digit, digitIndex) => {
                const shouldGlow =
                  activeStepFocus.stepKind === "partial-product";

                return (
                  <span
                    className={`mult-static-digit${shouldGlow ? " context-value-glow" : ""}`}
                    data-step-focus={shouldGlow ? "active" : "idle"}
                    data-step-focus-kind={shouldGlow ? activeStepFocus.stepKind : "none"}
                    key={`multiplicand-digit-${digitIndex}`}
                    style={{
                      gridColumnStart:
                        renderModel.columnCount - multiplicandDigits.length + digitIndex + 1,
                    }}
                  >
                    {digit}
                  </span>
                );
              })}
              {renderStaticDecimalPoint(renderModel.multiplicandDecimalPoint, "multiplicand")}
            </span>
          </p>
          <p className="mult-statement-row mult-statement-rule" data-mult-row="multiplier">
            <span aria-hidden="true" className="mult-row-op">
              {"×"}
            </span>
            <span className="mult-digit-track">
              {multiplierDigits.map((digit, digitIndex) => {
                const digitPositionFromRight = multiplierDigits.length - 1 - digitIndex;
                const shouldGlow =
                  activeStepFocus.stepKind === "partial-product" &&
                  digitPositionFromRight === activeStepFocus.shiftZeroCount;

                return (
                  <span
                    className={`mult-static-digit${
                      shouldGlow ? " context-value-glow mult-multiplier-digit-active" : ""
                    }`}
                    data-step-focus={shouldGlow ? "active" : "idle"}
                    data-step-focus-kind={shouldGlow ? activeStepFocus.stepKind : "none"}
                    key={`multiplier-digit-${digitIndex}`}
                    style={{
                      gridColumnStart:
                        renderModel.columnCount - multiplierDigits.length + digitIndex + 1,
                    }}
                  >
                    {digit}
                  </span>
                );
              })}
              {renderStaticDecimalPoint(renderModel.multiplierDecimalPoint, "multiplier")}
            </span>
          </p>
        </div>

        <ol className="mult-work-rows">
          <li aria-hidden="true" className="mult-work-row mult-carry-row mult-sum-carry-row">
            <span className="mult-row-op"> </span>
            <span className="mult-digit-track">
              {activeStepFocus.carryDigits.map((carryDigit, positionFromRight) => {
                const isCarryRevealed =
                  activeStepFocus.stepKind === "product-sum" &&
                  carryDigit > 0 &&
                  activeRowSuffix.length >= positionFromRight;

                if (!isCarryRevealed) {
                  return null;
                }

                return (
                  <span
                    className="mult-carry-digit"
                    data-mult-carry="visible"
                    key={`sum-carry-${positionFromRight}`}
                    style={{
                      gridRowStart: 1,
                      gridColumnStart: renderModel.columnCount - positionFromRight,
                    }}
                  >
                    {carryDigit}
                  </span>
                );
              })}
            </span>
          </li>
          {renderModel.workRows.length === 0 ? (
            <li className="mult-work-row mult-work-row-placeholder">
              <span aria-hidden="true" className="mult-row-op">
                {" "}
              </span>
              <span className="work-row-value">...</span>
            </li>
          ) : (
            renderModel.workRows.map((row) => {
              const expectedValue = stepById.get(row.stepId)?.expectedValue ?? row.value;
              const typedSuffix = row.isFilled
                ? expectedValue
                : liveTypingState.draftEntryValues[row.stepId] ?? "";
              const rowActiveDigitIndex = Math.max(
                row.expectedDigitCount - 1 - typedSuffix.length,
                0,
              );
              const isRowRetryLocked = Boolean(retryLockedStepIds[row.stepId]);
              const isRowErrorPulse = Boolean(errorPulseStepIds[row.stepId]);
              const rowDecimalPoint =
                decimalPoint && decimalPoint.rowStepId === row.stepId ? decimalPoint : null;
              const decimalPointState = !rowDecimalPoint
                ? "none"
                : rowDecimalPoint.isFilled
                  ? "placed"
                  : rowDecimalPoint.isActive
                    ? "choosing"
                    : "pending";

              return (
                <li
                  className="mult-work-row"
                  data-step-kind={row.kind}
                  data-mult-shift={row.shiftZeroCount}
                  data-decimal-point={decimalPointState}
                  key={row.stepId}
                >
                  <span aria-hidden="true" className="mult-row-op">
                    {row.displayPrefix || " "}
                  </span>
                  <span className="mult-digit-track">
                    {Array.from({ length: row.expectedDigitCount }, (_, digitIndex) => {
                      const suffixStartIndex = row.expectedDigitCount - typedSuffix.length;
                      const isDigitFilled = row.isFilled || digitIndex >= suffixStartIndex;
                      const digitValue = row.isFilled
                        ? expectedValue[digitIndex] ?? ""
                        : digitIndex >= suffixStartIndex
                          ? typedSuffix[digitIndex - suffixStartIndex] ?? ""
                          : "";
                      const isActiveDigit =
                        row.isActive && !row.isFilled && digitIndex === rowActiveDigitIndex;

                      return (
                        <MultiplicationEntryCell
                          digitIndex={digitIndex}
                          isActive={isActiveDigit}
                          isAutoEntry={false}
                          isErrorPulse={isRowErrorPulse && isActiveDigit}
                          isFilled={isDigitFilled}
                          isInteractive={isActiveDigit && !isRowRetryLocked}
                          isLockingIn={Boolean(lockingStepIds[row.stepId])}
                          isRetryLocked={isRowRetryLocked && isActiveDigit}
                          key={`${row.stepId}:digit:${digitIndex}`}
                          onInput={(event) => handleDigitInput(row, typedSuffix, event)}
                          onKeyDown={(event) => handleDigitKeyDown(row, typedSuffix, event)}
                          onPaste={handleDigitPaste}
                          stepId={row.stepId}
                          stepKind={row.kind}
                          style={{ gridColumnStart: row.startColumn + digitIndex }}
                          targetId={row.targetId}
                          value={digitValue}
                        />
                      );
                    })}
                    {Array.from({ length: row.shiftZeroCount }, (_, zeroIndex) => (
                      <MultiplicationEntryCell
                        digitIndex={row.expectedDigitCount + zeroIndex}
                        isActive={false}
                        isAutoEntry
                        isErrorPulse={false}
                        isFilled
                        isInteractive={false}
                        isLockingIn={false}
                        isRetryLocked={false}
                        key={`${row.stepId}:shift-zero:${zeroIndex}`}
                        stepId={row.stepId}
                        stepKind={row.kind}
                        style={{
                          gridColumnStart: row.startColumn + row.expectedDigitCount + zeroIndex,
                        }}
                        targetId={null}
                        value="0"
                      />
                    ))}
                    {rowDecimalPoint?.isActive
                      ? rowDecimalPoint.slots.map((slot) => {
                          const slotFlagKey = toDecimalSlotFlagKey(
                            rowDecimalPoint.stepId,
                            slot.decimalPlaces,
                          );
                          const isSlotErrorPulse = Boolean(errorPulseStepIds[slotFlagKey]);
                          const isSlotRetryLocked = Boolean(retryLockedStepIds[slotFlagKey]);
                          const slotClassName = [
                            "mult-decimal-slot",
                            isSlotErrorPulse ? "inline-entry-error-pulse" : "",
                            isSlotRetryLocked ? "inline-entry-retry-lock" : "",
                          ]
                            .filter(Boolean)
                            .join(" ");

                          return (
                            <button
                              aria-label={describeDecimalSlot(
                                slot.decimalPlaces,
                                rowDecimalPoint.productDigitCount,
                              )}
                              className={slotClassName}
                              data-decimal-places={String(slot.decimalPlaces)}
                              data-decimal-slot-error={
                                isSlotErrorPulse ? "pulse" : isSlotRetryLocked ? "locked" : "none"
                              }
                              data-entry-step-id={rowDecimalPoint.stepId}
                              data-entry-step-kind="decimal-point"
                              data-entry-target-id={rowDecimalPoint.targetId ?? ""}
                              disabled={isDecimalStepRetryLocked}
                              key={`${rowDecimalPoint.stepId}:slot:${slot.decimalPlaces}`}
                              onClick={() => handleDecimalSlotClick(slot)}
                              style={{ gridRowStart: 1, gridColumnStart: slot.column }}
                              type="button"
                            >
                              <span aria-hidden="true" className="mult-decimal-point-dot" />
                            </button>
                          );
                        })
                      : null}
                    {rowDecimalPoint?.placedPosition
                      ? renderLeadingZero(rowDecimalPoint.placedPosition, "product")
                      : null}
                    {rowDecimalPoint?.placedPosition ? (
                      <span
                        aria-label={`Decimal point placed: ${renderModel.productDisplayText}`}
                        className="mult-decimal-point mult-product-decimal-point"
                        data-entry-animation={
                          lockingStepIds[rowDecimalPoint.stepId] ? "lock-in" : "none"
                        }
                        data-entry-step-id={rowDecimalPoint.stepId}
                        data-entry-step-kind="decimal-point"
                        data-entry-state="locked"
                        data-mult-decimal-point="product"
                        role="img"
                        style={{
                          gridRowStart: 1,
                          gridColumnStart: rowDecimalPoint.placedPosition.column,
                        }}
                      >
                        <span className="mult-decimal-point-dot" />
                      </span>
                    ) : null}
                  </span>
                </li>
              );
            })
          )}
        </ol>
      </div>
    </article>
  );
}
