"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { solveLongDivision } from "@/features/division-engine/lib/long-division-solver";
import type { DivisionProblem, LongDivisionStep } from "@/features/contracts";
import type { LongDivisionStepValidationResult } from "@/features/division-engine/lib/step-validation";
import {
  applyFractionDivisorChoice,
  applyFractionReductionEntry,
  createFractionReductionSession,
  FRACTION_DIVISOR_CHOICES,
  getFractionDivisionTargets,
  getFractionReductionProgress,
  NO_COMMON_DIVISOR_CHOICE,
  type FractionReductionChoice,
  type FractionReductionPart,
  type FractionReductionProblem,
  type FractionReductionRow,
} from "@/features/fraction-engine";

import { playWorkspaceSoundEffect } from "../lib/sound-effects";
import { LiveDivisionWorkspacePanel } from "./live-division-workspace-panel";

/** Matches the workspace's own error-pulse timing so feedback feels identical. */
const CHOICE_ERROR_PULSE_DURATION_MS = 360;

export interface FractionReductionPanelProps {
  readonly problem: FractionReductionProblem;
  /** Fires once, when the player confirms the fraction cannot be reduced further. */
  readonly onProblemSolved?: (problemId: string) => void;
  /** Fires on every wrong choice or wrong answer, for streak tracking. */
  readonly onIncorrectAttempt?: () => void;
}

interface HelperModalState {
  readonly rowIndex: number;
  readonly part: FractionReductionPart;
  readonly problem: DivisionProblem;
  readonly steps: readonly LongDivisionStep[];
}

type EntryDrafts = Record<FractionReductionPart, string>;

const EMPTY_DRAFTS: EntryDrafts = { numerator: "", denominator: "" };

function sanitizeDigits(value: string): string {
  return value.replace(/\D+/g, "").slice(0, 6);
}

function toPartLabel(part: FractionReductionPart): string {
  return part === "numerator" ? "numerator" : "denominator";
}

/**
 * A blank the player types a whole number into. Mirrors the long-division
 * workspace: a contentEditable span rather than a form control, digits only,
 * and the same amber glow / red shake vocabulary.
 */
function FractionEntryBlank({
  ariaLabel,
  draft,
  hasError,
  isActive,
  isFilled,
  onChange,
  shouldAutoFocus,
  value,
}: {
  readonly ariaLabel: string;
  readonly draft: string;
  readonly hasError: boolean;
  readonly isActive: boolean;
  readonly isFilled: boolean;
  readonly onChange: (nextValue: string) => void;
  readonly shouldAutoFocus: boolean;
  readonly value: number | null;
}): React.ReactElement {
  const entryRef = useRef<HTMLSpanElement | null>(null);

  // Move the caret to whichever blank is next, the way the long-division
  // workspace advances focus, so the player never has to click a box.
  useEffect(() => {
    if (!shouldAutoFocus) {
      return;
    }

    const entryElement = entryRef.current;
    if (entryElement && document.activeElement !== entryElement) {
      entryElement.focus();
    }
  }, [shouldAutoFocus]);

  useEffect(() => {
    const entryElement = entryRef.current;
    if (!entryElement) {
      return;
    }

    const nextText = isFilled ? String(value ?? "") : draft;
    if (entryElement.textContent !== nextText) {
      entryElement.textContent = nextText;
    }
  }, [draft, isFilled, value]);

  const className = [
    "inline-entry",
    "digit-cell",
    "fraction-entry",
    isFilled ? "inline-entry-locked" : "inline-entry-pending",
    isActive && !isFilled ? "inline-entry-active glow-amber" : "",
    hasError ? "inline-entry-error-pulse" : "",
  ]
    .filter((entry) => entry.length > 0)
    .join(" ");

  return (
    <span
      aria-invalid={hasError ? "true" : undefined}
      aria-label={ariaLabel}
      className={className}
      contentEditable={!isFilled}
      data-entry-active={isActive && !isFilled ? "true" : "false"}
      data-entry-error={hasError ? "pulse" : "none"}
      data-entry-glow={isActive && !isFilled ? "amber" : "none"}
      data-entry-inline="true"
      data-entry-lane="fraction"
      data-entry-state={isFilled ? "locked" : "pending"}
      data-ui-component="fraction-entry"
      onInput={(event) => {
        onChange(sanitizeDigits(event.currentTarget.textContent ?? ""));
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          return;
        }

        if (event.key.length === 1 && /\D/.test(event.key)) {
          event.preventDefault();
        }
      }}
      onPaste={(event) => {
        event.preventDefault();
        onChange(sanitizeDigits(event.clipboardData.getData("text")));
      }}
      ref={entryRef}
      role="textbox"
      spellCheck={false}
      suppressContentEditableWarning
      tabIndex={isFilled ? -1 : 0}
    />
  );
}

function FractionDisplay({
  denominator,
  numerator,
}: {
  readonly denominator: React.ReactNode;
  readonly numerator: React.ReactNode;
}): React.ReactElement {
  return (
    <span className="fraction-value" data-ui-component="fraction-value">
      <span className="fraction-numerator">{numerator}</span>
      <span className="fraction-bar" aria-hidden="true" />
      <span className="fraction-denominator">{denominator}</span>
    </span>
  );
}

export function FractionReductionPanel({
  onIncorrectAttempt,
  onProblemSolved,
  problem,
}: FractionReductionPanelProps): React.ReactElement {
  const [session, setSession] = useState(() => createFractionReductionSession(problem));
  const [drafts, setDrafts] = useState<EntryDrafts>(EMPTY_DRAFTS);
  const [rejectedChoice, setRejectedChoice] = useState<FractionReductionChoice | null>(null);
  const [entryError, setEntryError] = useState<FractionReductionPart | null>(null);
  const [helperModal, setHelperModal] = useState<HelperModalState | null>(null);
  const hasReportedSolvedRef = useRef(false);

  const activeRowIndex = session.rows.length - 1;
  const progress = getFractionReductionProgress(session);
  const modalHost = typeof document !== "undefined" ? document.body : null;

  useEffect(() => {
    if (rejectedChoice === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setRejectedChoice(null);
    }, CHOICE_ERROR_PULSE_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [rejectedChoice]);

  useEffect(() => {
    if (entryError === null) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setEntryError(null);
    }, CHOICE_ERROR_PULSE_DURATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [entryError]);

  // Escape closes the helper modal, and the page behind it must not scroll —
  // same handling as the reward and gallery modals.
  useEffect(() => {
    if (!helperModal) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setHelperModal(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [helperModal]);

  const handleDivisorChoice = useCallback(
    (choice: FractionReductionChoice) => {
      const result = applyFractionDivisorChoice(session, choice);

      if (result.outcome === "divisor-rejected") {
        playWorkspaceSoundEffect("digit-error");
        setRejectedChoice(choice);
        onIncorrectAttempt?.();
        return;
      }

      if (result.outcome === "ignored") {
        return;
      }

      setSession(result.state);
      setDrafts(EMPTY_DRAFTS);

      if (result.outcome === "problem-solved") {
        playWorkspaceSoundEffect("problem-complete");
        if (!hasReportedSolvedRef.current) {
          hasReportedSolvedRef.current = true;
          onProblemSolved?.(problem.id);
        }
        return;
      }

      playWorkspaceSoundEffect("step-lock-in");
    },
    [onIncorrectAttempt, onProblemSolved, problem.id, session],
  );

  const submitEntry = useCallback(
    (part: FractionReductionPart, value: number) => {
      const result = applyFractionReductionEntry(session, part, value);

      if (result.outcome === "entry-rejected") {
        playWorkspaceSoundEffect("digit-error");
        setEntryError(part);
        setDrafts((currentDrafts) => ({ ...currentDrafts, [part]: "" }));
        onIncorrectAttempt?.();
        return;
      }

      if (result.outcome === "ignored") {
        return;
      }

      playWorkspaceSoundEffect(result.outcome === "row-complete" ? "step-lock-in" : "digit-correct");
      setSession(result.state);
      setDrafts((currentDrafts) =>
        result.outcome === "row-complete" ? EMPTY_DRAFTS : { ...currentDrafts, [part]: "" },
      );
    },
    [onIncorrectAttempt, session],
  );

  const handleEntryChange = useCallback(
    (part: FractionReductionPart, nextDraft: string, expectedValue: number) => {
      setDrafts((currentDrafts) => ({ ...currentDrafts, [part]: nextDraft }));

      // Check as soon as the player has typed as many digits as the answer has,
      // matching how the long-division rows validate on the final digit.
      const expectedLength = String(expectedValue).length;
      if (nextDraft.length < expectedLength) {
        return;
      }

      submitEntry(part, Number.parseInt(nextDraft, 10));
    },
    [submitEntry],
  );

  const openHelperModal = useCallback(
    (rowIndex: number, part: FractionReductionPart, row: FractionReductionRow) => {
      if (row.divisor === null) {
        return;
      }

      const dividend =
        part === "numerator" ? row.fraction.numerator : row.fraction.denominator;
      const helperProblem: DivisionProblem = {
        id: `${problem.id}:helper-${rowIndex}-${part}`,
        dividend,
        divisor: row.divisor,
        allowRemainder: false,
        difficultyLevel: problem.difficultyLevel,
      };

      setHelperModal({
        rowIndex,
        part,
        problem: helperProblem,
        steps: solveLongDivision(helperProblem).steps,
      });
    },
    [problem.difficultyLevel, problem.id],
  );

  const handleHelperValidation = useCallback(
    (validation: LongDivisionStepValidationResult) => {
      if (!helperModal || !validation.didAdvance || validation.outcome !== "complete") {
        return;
      }

      const activeRow = session.rows[helperModal.rowIndex];
      if (!activeRow || activeRow.divisor === null) {
        setHelperModal(null);
        return;
      }

      const targets = getFractionDivisionTargets(activeRow.fraction, activeRow.divisor);
      const solvedValue =
        helperModal.part === "numerator" ? targets.numerator : targets.denominator;

      setHelperModal(null);
      submitEntry(helperModal.part, solvedValue);
    },
    [helperModal, session.rows, submitEntry],
  );

  const renderDivisorChooser = useCallback(
    (rowIndex: number) => {
      const choices: readonly FractionReductionChoice[] = [
        ...FRACTION_DIVISOR_CHOICES,
        NO_COMMON_DIVISOR_CHOICE,
      ];

      return (
        <div
          aria-label="Common divisor choices"
          className="fraction-choice-box"
          data-ui-surface="fraction-divisor-choices"
          role="group"
        >
          <p className="fraction-choice-prompt">
            Are the numerator and denominator both divisible by&hellip;
          </p>
          <div className="fraction-choice-grid">
            {choices.map((choice) => {
              const isNoneChoice = choice === NO_COMMON_DIVISOR_CHOICE;

              return (
                <button
                  className={[
                    "fraction-choice-button",
                    isNoneChoice ? "fraction-choice-button-none" : "",
                    rejectedChoice === choice ? "inline-entry-error-pulse" : "",
                  ]
                    .filter((entry) => entry.length > 0)
                    .join(" ")}
                  data-choice-rejected={rejectedChoice === choice ? "true" : "false"}
                  data-ui-action={`select-fraction-divisor-${choice}`}
                  key={`row-${rowIndex}-choice-${choice}`}
                  onClick={() => {
                    handleDivisorChoice(choice);
                  }}
                  type="button"
                >
                  {isNoneChoice ? "None of the above" : choice}
                </button>
              );
            })}
          </div>
        </div>
      );
    },
    [handleDivisorChoice, rejectedChoice],
  );

  const isHelperModalOpen = helperModal !== null;

  const renderReductionLine = useCallback(
    (row: FractionReductionRow, rowIndex: number) => {
      if (row.divisor === null) {
        return null;
      }

      const targets = getFractionDivisionTargets(row.fraction, row.divisor);
      const isNumeratorFilled = row.numeratorEntry !== null;
      const isDenominatorFilled = row.denominatorEntry !== null;
      const isRowActive = rowIndex === activeRowIndex;

      const renderPart = (part: FractionReductionPart) => {
        const isFilled = part === "numerator" ? isNumeratorFilled : isDenominatorFilled;
        const expectedValue = part === "numerator" ? targets.numerator : targets.denominator;
        const filledValue = part === "numerator" ? row.numeratorEntry : row.denominatorEntry;
        const isActivePart =
          isRowActive && !isFilled && (part === "numerator" || isNumeratorFilled);

        return (
          <span className="fraction-entry-slot">
            <FractionEntryBlank
              ariaLabel={`${toPartLabel(part)} divided by ${row.divisor}`}
              draft={isRowActive ? drafts[part] : ""}
              hasError={isRowActive && entryError === part}
              isActive={isActivePart}
              isFilled={isFilled}
              onChange={(nextDraft) => {
                handleEntryChange(part, nextDraft, expectedValue);
              }}
              shouldAutoFocus={isActivePart && !isHelperModalOpen}
              value={filledValue}
            />
            {isFilled ? null : (
              <button
                aria-label={`Work out ${
                  part === "numerator" ? row.fraction.numerator : row.fraction.denominator
                } divided by ${row.divisor}`}
                className="fraction-help-button"
                data-ui-action={`open-fraction-helper-${part}`}
                onClick={() => {
                  openHelperModal(rowIndex, part, row);
                }}
                type="button"
              >
                ?
              </button>
            )}
          </span>
        );
      };

      return (
        <div className="fraction-reduction-line" data-ui-surface="fraction-reduction-line">
          <span className="fraction-equals" aria-hidden="true">
            =
          </span>
          <FractionDisplay
            denominator={renderPart("denominator")}
            numerator={renderPart("numerator")}
          />
          <p className="fraction-hint" data-ui-component="fraction-hint">
            Divide the numerator and denominator by {row.divisor}
          </p>
        </div>
      );
    },
    [
      activeRowIndex,
      drafts,
      entryError,
      handleEntryChange,
      isHelperModalOpen,
      openHelperModal,
    ],
  );

  const solvedFraction = useMemo(() => {
    const finalRow = session.rows[session.rows.length - 1];
    return finalRow ? finalRow.fraction : problem.fraction;
  }, [problem.fraction, session.rows]);

  return (
    <div className="fraction-workspace" data-ui-surface="fraction-workspace">
      <div className="workspace-paper fraction-paper">
        <p className="workspace-label">Reduce the fraction to its lowest terms</p>

        <ol className="fraction-row-list">
          {session.rows.map((row, rowIndex) => {
            const isActiveRow = rowIndex === activeRowIndex;
            const shouldShowChooser =
              isActiveRow && session.status === "choosing-divisor";

            return (
              <li
                className="fraction-row"
                data-fraction-row-index={rowIndex}
                data-ui-surface="fraction-row"
                key={`${problem.id}-row-${rowIndex}-${row.fraction.numerator}-${row.fraction.denominator}`}
              >
                <div className="fraction-row-main">
                  {rowIndex === 0 ? null : (
                    <span className="fraction-row-connector" aria-hidden="true" />
                  )}
                  <FractionDisplay
                    denominator={row.fraction.denominator}
                    numerator={row.fraction.numerator}
                  />
                  {renderReductionLine(row, rowIndex)}
                </div>
                {shouldShowChooser ? renderDivisorChooser(rowIndex) : null}
              </li>
            );
          })}
        </ol>

        {session.status === "solved" ? (
          <p className="fraction-solved-note" data-ui-component="fraction-solved-note">
            Fully reduced: {solvedFraction.numerator}/{solvedFraction.denominator} cannot go any
            lower.
          </p>
        ) : null}
      </div>

      <aside className="hint-stack" data-feedback-tone="neutral">
        <p className="hint-title">Console Coach</p>
        <p className="hint-status">
          Round {Math.min(progress.completedRounds + 1, progress.totalRounds)} of{" "}
          {progress.totalRounds}
        </p>
        <ul className="coach-list">
          <li className="coach-item">
            Find a number that divides the top <em>and</em> the bottom.
          </li>
          <li className="coach-item">
            Stuck on the division? Tap <strong>?</strong> to work it out on paper.
          </li>
          <li className="coach-item">
            When nothing divides both any more, choose <strong>None of the above</strong>.
          </li>
        </ul>
      </aside>

      {helperModal && modalHost
        ? createPortal(
            <div
              className="jp-modal-backdrop"
              data-ui-surface="fraction-helper-modal"
              onClick={() => {
                setHelperModal(null);
              }}
              role="presentation"
            >
              <div className="jp-modal-aura">
                <section
                  aria-label="Work out the division"
                  aria-modal="true"
                  className="jp-modal jp-modal-workspace"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                  role="dialog"
                >
                  <p className="surface-kicker">Scratch pad</p>
                  <h3 className="surface-title">
                    {helperModal.problem.dividend} &divide; {helperModal.problem.divisor}
                  </h3>
                  <p className="fraction-hint">
                    Solve it here and the answer drops into the {toPartLabel(helperModal.part)}.
                  </p>
                  <LiveDivisionWorkspacePanel
                    dividend={helperModal.problem.dividend}
                    divisor={helperModal.problem.divisor}
                    key={helperModal.problem.id}
                    onStepValidation={handleHelperValidation}
                    steps={helperModal.steps}
                  />
                  <button
                    className="jp-button jp-button-secondary"
                    data-ui-action="close-fraction-helper"
                    onClick={() => {
                      setHelperModal(null);
                    }}
                    type="button"
                  >
                    Close
                  </button>
                </section>
              </div>
            </div>,
            modalHost,
          )
        : null}
    </div>
  );
}
