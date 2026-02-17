"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
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
  buildBringDownAnimationSourceByStepId,
  buildBusStopRenderModel,
  createLiveWorkspaceTypingState,
  resolveInlineWorkspaceEntryValue,
  sanitizeInlineWorkspaceEntryValue,
  tryAutoAdvanceBringDownStep,
  type LiveWorkspaceEntryInputTransition,
  type LiveWorkspaceTypingState,
  type WorkspaceDraftEntryValues,
} from "@/features/workspace-ui/lib";

const LOCK_IN_ANIMATION_DURATION_MS = 280;
const BRING_DOWN_ANIMATION_DURATION_MS = 420;
const NON_DIGIT_KEY_PATTERN = /^\D$/;
const EMPTY_DRAFT_ENTRY_VALUES: WorkspaceDraftEntryValues = {};

export interface BusStopLongDivisionRendererProps {
  divisor: number;
  dividend: number;
  steps: readonly LongDivisionStep[];
  revealedStepCount?: number;
  enableLiveTyping?: boolean;
  onStepValidation?: (validation: LongDivisionStepValidationResult) => void;
}

type InlineEntryLane = "quotient" | "work-row";

interface WorkspaceInlineEntryProps {
  stepId: string;
  lane: InlineEntryLane;
  targetId: string | null;
  value: string;
  isFilled: boolean;
  isActive: boolean;
  isInteractive: boolean;
  isAutoEntry: boolean;
  isLockingIn: boolean;
  onInput?: (stepId: string, event: FormEvent<HTMLSpanElement>) => void;
  onKeyDown?: (stepId: string, event: KeyboardEvent<HTMLSpanElement>) => void;
  onPaste?: (stepId: string, event: ClipboardEvent<HTMLSpanElement>) => void;
}

function buildInlineEntryClassName({
  lane,
  isFilled,
  isActive,
  isLockingIn,
}: Pick<WorkspaceInlineEntryProps, "lane" | "isFilled" | "isActive" | "isLockingIn">): string {
  const classes = [
    "inline-entry",
    lane === "quotient"
      ? "inline-entry-quotient digit-cell quotient-digit-cell"
      : "inline-entry-work-row work-row-value",
    isFilled ? "inline-entry-locked" : "inline-entry-pending",
    lane === "quotient" && !isFilled ? "quotient-digit-empty" : "",
    isActive ? "inline-entry-active glow-amber" : "",
    isLockingIn ? "inline-entry-lock-in" : "",
  ];

  return classes.filter(Boolean).join(" ");
}

function renderInlineEntryText(value: string): string {
  return value.length > 0 ? value : "\u00a0";
}

function WorkspaceInlineEntry({
  stepId,
  lane,
  targetId,
  value,
  isFilled,
  isActive,
  isInteractive,
  isAutoEntry,
  isLockingIn,
  onInput,
  onKeyDown,
  onPaste,
}: WorkspaceInlineEntryProps) {
  const isEditable = isInteractive && !isFilled && !isAutoEntry && Boolean(targetId);

  return (
    <span
      aria-label={isEditable ? "Inline workspace entry" : undefined}
      className={buildInlineEntryClassName({ lane, isFilled, isActive, isLockingIn })}
      contentEditable={isEditable}
      data-entry-active={isActive ? "true" : "false"}
      data-entry-auto={isAutoEntry ? "true" : "false"}
      data-entry-animation={isLockingIn ? "lock-in" : "none"}
      data-entry-glow={isActive ? "amber" : "none"}
      data-entry-inline="true"
      data-entry-lane={lane}
      data-entry-live={isInteractive ? "true" : "false"}
      data-entry-state={isFilled ? "locked" : "pending"}
      data-entry-target-id={targetId ?? ""}
      onInput={isEditable ? (event) => onInput?.(stepId, event) : undefined}
      onKeyDown={isEditable ? (event) => onKeyDown?.(stepId, event) : undefined}
      onPaste={isEditable ? (event) => onPaste?.(stepId, event) : undefined}
      role={isEditable ? "textbox" : undefined}
      spellCheck={false}
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
  const bringDownAnimationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  const clearBringDownAnimationTimeout = useCallback(() => {
    if (!bringDownAnimationTimeoutRef.current) {
      return;
    }

    clearTimeout(bringDownAnimationTimeoutRef.current);
    bringDownAnimationTimeoutRef.current = null;
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
      clearBringDownAnimationTimeout();
    };
  }, [clearBringDownAnimationTimeout]);

  useEffect(() => {
    if (!liveTypingEnabled || !renderModel.activeTargetId) {
      return;
    }

    const workspaceElement = workspaceRef.current;
    if (!workspaceElement) {
      return;
    }

    const activeEntry = workspaceElement.querySelector<HTMLElement>(
      `[data-entry-target-id="${renderModel.activeTargetId}"][contenteditable="true"]`,
    );
    if (!activeEntry) {
      return;
    }

    if (document.activeElement !== activeEntry) {
      activeEntry.focus();
    }
  }, [liveTypingEnabled, renderModel.activeTargetId]);

  useEffect(() => {
    clearBringDownAnimationTimeout();
  }, [clearBringDownAnimationTimeout, stepIdentity]);

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
      applyCommittedTransition(transition);

      if (!liveTypingEnabled || !transition.didAdvance || !transition.validation) {
        clearBringDownAnimationTimeout();
        clearBringDownAnimationState();
        return;
      }

      const focusStepIndex = transition.validation.focusStepIndex;
      const nextStep = typeof focusStepIndex === "number" ? steps[focusStepIndex] : null;

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

  const handleInlineEntryInput = useCallback(
    (stepId: string, event: FormEvent<HTMLSpanElement>) => {
      const currentText = event.currentTarget.textContent ?? "";
      const sanitizedValue = sanitizeInlineWorkspaceEntryValue(currentText);

      if (currentText !== sanitizedValue) {
        event.currentTarget.textContent = sanitizedValue;
      }

      applyInlineEntryTransition(stepId, sanitizedValue);
    },
    [applyInlineEntryTransition],
  );

  const handleInlineEntryKeyDown = useCallback(
    (_stepId: string, event: KeyboardEvent<HTMLSpanElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        return;
      }

      if (event.key.length === 1 && NON_DIGIT_KEY_PATTERN.test(event.key)) {
        event.preventDefault();
      }
    },
    [],
  );

  const handleInlineEntryPaste = useCallback(
    (stepId: string, event: ClipboardEvent<HTMLSpanElement>) => {
      event.preventDefault();

      const pastedValue = sanitizeInlineWorkspaceEntryValue(
        event.clipboardData.getData("text"),
      );
      event.currentTarget.textContent = pastedValue;
      applyInlineEntryTransition(stepId, pastedValue);
    },
    [applyInlineEntryTransition],
  );

  return (
    <article
      aria-label="Long-division workspace"
      className="workspace-paper bus-stop-renderer"
      data-bring-down-animation={bringDownAnimationStepId ? "running" : "idle"}
      data-ui-component="bus-stop-renderer"
      data-workspace-live-typing={liveTypingEnabled ? "enabled" : "disabled"}
      ref={workspaceRef}
    >
      <p className="workspace-label">Quotient</p>
      <div className="bus-stop-notation">
        <div className="quotient-row">
          <span aria-hidden="true" className="quotient-row-spacer">
            {renderModel.divisorText}
          </span>
          <div className="quotient-track">
            {renderModel.quotientCells.map((cell) => (
              <WorkspaceInlineEntry
                isActive={cell.isActive}
                isAutoEntry={false}
                isFilled={cell.isFilled}
                isInteractive={liveTypingEnabled}
                isLockingIn={Boolean(lockingStepIds[cell.stepId])}
                key={cell.stepId}
                lane="quotient"
                onInput={liveTypingEnabled ? handleInlineEntryInput : undefined}
                onKeyDown={liveTypingEnabled ? handleInlineEntryKeyDown : undefined}
                onPaste={liveTypingEnabled ? handleInlineEntryPaste : undefined}
                stepId={cell.stepId}
                targetId={cell.targetId}
                value={resolveInlineWorkspaceEntryValue({
                  stepId: cell.stepId,
                  lockedValue: cell.value,
                  isFilled: cell.isFilled,
                  draftEntryValues,
                })}
              />
            ))}
          </div>
        </div>

        <div className="bus-stop-core">
          <p className="divisor-cell">{renderModel.divisorText}</p>
          <div className="bracket-stack">
            <p className="dividend-line" data-bring-down-source-step-id={bringDownAnimationStepId ?? ""}>
              {dividendDigits.map((digit, digitIndex) => {
                const isBringDownSourceDigit =
                  activeBringDownAnimationSource?.sourceDividendDigitIndex === digitIndex;

                return (
                  <span
                    className={`dividend-digit${isBringDownSourceDigit ? " dividend-digit-bring-down-origin" : ""}`}
                    data-bring-down-origin={isBringDownSourceDigit ? "active" : "idle"}
                    data-dividend-digit-index={digitIndex}
                    key={`dividend-digit-${digitIndex}`}
                  >
                    {digit}
                  </span>
                );
              })}
            </p>

            <ol className="work-rows">
              {renderModel.workRows.length === 0 ? (
                <li className="work-row work-row-placeholder">
                  <span aria-hidden="true" className="work-row-op">
                    &nbsp;
                  </span>
                  <span className="work-row-value">...</span>
                </li>
              ) : (
                renderModel.workRows.map((row) => (
                  <li className="work-row" data-step-kind={row.kind} key={row.stepId}>
                    <span aria-hidden="true" className="work-row-op">
                      {row.displayPrefix || "\u00a0"}
                    </span>
                    <div
                      className="work-row-value-shell"
                      data-bring-down-animation={bringDownAnimationStepId === row.stepId ? "running" : "idle"}
                    >
                      <WorkspaceInlineEntry
                        isActive={row.isActive}
                        isAutoEntry={row.kind === "bring-down" && liveTypingEnabled}
                        isFilled={row.isFilled}
                        isInteractive={liveTypingEnabled}
                        isLockingIn={Boolean(lockingStepIds[row.stepId])}
                        lane="work-row"
                        onInput={liveTypingEnabled ? handleInlineEntryInput : undefined}
                        onKeyDown={liveTypingEnabled ? handleInlineEntryKeyDown : undefined}
                        onPaste={liveTypingEnabled ? handleInlineEntryPaste : undefined}
                        stepId={row.stepId}
                        targetId={row.targetId}
                        value={resolveInlineWorkspaceEntryValue({
                          stepId: row.stepId,
                          lockedValue: row.value,
                          isFilled: row.isFilled,
                          draftEntryValues,
                        })}
                      />
                      {bringDownAnimationStepId === row.stepId ? (
                        <span aria-hidden="true" className="bring-down-digit-slide">
                          {activeBringDownAnimationSource?.digit ?? "\u00a0"}
                        </span>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
            </ol>
          </div>
        </div>
      </div>
    </article>
  );
}
