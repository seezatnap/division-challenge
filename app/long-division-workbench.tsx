"use client";

import { useEffect, useState, type FormEvent } from "react";

import {
  DIVISION_DIFFICULTIES,
  type DivisionDifficultyId,
} from "@/lib/domain";
import {
  advanceLongDivisionWorkbenchProblem,
  buildLongDivisionStepPrompt,
  createLongDivisionWorkbenchState,
  getLongDivisionStepLabel,
  submitLongDivisionWorkbenchStepInput,
} from "@/lib/long-division-workbench";
import { getCurrentLongDivisionStep } from "@/lib/long-division-step-engine";

const AUTO_ADVANCE_DELAY_MS = 1200;
const ATTEMPT_HISTORY_LIMIT = 8;
const DIFFICULTY_LABELS: ReadonlyMap<DivisionDifficultyId, string> = new Map(
  DIVISION_DIFFICULTIES.map((difficulty) => [difficulty.id, difficulty.label]),
);

interface LongDivisionWorkbenchProps {
  difficulty: DivisionDifficultyId;
}

function getFeedbackClassName(tone: string): string {
  if (tone === "success") {
    return "border-emerald-500 bg-emerald-900/50 text-emerald-50";
  }

  if (tone === "error") {
    return "border-amber-500 bg-amber-900/30 text-amber-100";
  }

  if (tone === "complete") {
    return "border-lime-500 bg-lime-900/30 text-lime-100";
  }

  return "border-emerald-700 bg-emerald-950/40 text-emerald-100";
}

export default function LongDivisionWorkbench({
  difficulty,
}: LongDivisionWorkbenchProps) {
  const [workbenchState, setWorkbenchState] = useState(() =>
    createLongDivisionWorkbenchState({ difficulty }),
  );
  const [stepInput, setStepInput] = useState("");

  useEffect(() => {
    if (!workbenchState.pendingAdvance) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setWorkbenchState((previousState) =>
        advanceLongDivisionWorkbenchProblem(previousState),
      );
      setStepInput("");
    }, AUTO_ADVANCE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [workbenchState.pendingAdvance]);

  const currentStep = getCurrentLongDivisionStep(workbenchState.stepState);
  const totalStepCount = workbenchState.stepState.sequence.length;
  const completedStepCount = Math.min(
    workbenchState.stepState.currentStepIndex,
    totalStepCount,
  );
  const recentAttempts = workbenchState.attempts.slice(-ATTEMPT_HISTORY_LIMIT);
  const difficultyLabel =
    DIFFICULTY_LABELS.get(workbenchState.problem.difficulty) ??
    workbenchState.problem.difficulty;
  const isInputDisabled =
    currentStep === null || workbenchState.pendingAdvance;

  function handleStepSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();

    const submission = submitLongDivisionWorkbenchStepInput(
      workbenchState,
      stepInput,
    );
    setWorkbenchState(submission.state);

    if (submission.validation.isCorrect) {
      setStepInput("");
    }
  }

  function handleAdvanceNowClick(): void {
    setWorkbenchState((previousState) =>
      advanceLongDivisionWorkbenchProblem(previousState),
    );
    setStepInput("");
  }

  return (
    <section className="mt-6 rounded-xl border border-emerald-700 bg-emerald-950/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold tracking-tight">
          Work on Paper Practice
        </h3>
        <p className="text-sm text-emerald-100">
          Solved this run: <span className="font-semibold">{workbenchState.solvedCount}</span>
        </p>
      </div>

      <div
        key={workbenchState.problem.id}
        className={`mt-4 rounded-lg border border-emerald-700 bg-emerald-900/30 p-4 transition-opacity duration-300 ${
          workbenchState.pendingAdvance ? "opacity-70" : "opacity-100"
        }`}
      >
        <p className="text-xs uppercase tracking-[0.12em] text-emerald-200">
          Current Problem
        </p>
        <div className="mt-2 flex items-start text-3xl font-black text-emerald-50">
          <span className="pr-3">{workbenchState.problem.divisor}</span>
          <span className="border-l-2 border-t-2 border-emerald-300 px-3 py-1">
            {workbenchState.problem.dividend}
          </span>
        </div>
        <p className="mt-2 text-sm text-emerald-100">
          Difficulty: {difficultyLabel}
        </p>
        <p className="mt-1 text-sm text-emerald-100">
          Step Progress: {completedStepCount}/{totalStepCount}
        </p>
      </div>

      <div className="mt-4 rounded-lg border border-emerald-700 bg-emerald-900/20 p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-emerald-200">
          Current Step
        </p>
        {currentStep ? (
          <>
            <p className="mt-2 text-sm font-semibold text-emerald-50">
              {getLongDivisionStepLabel(currentStep.step)} (cycle{" "}
              {currentStep.cycleIndex + 1})
            </p>
            <p className="mt-1 text-sm text-emerald-100">
              {buildLongDivisionStepPrompt(currentStep)}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-emerald-100">
            Problem complete. Stand by for the next challenge.
          </p>
        )}

        <form onSubmit={handleStepSubmit} className="mt-4 flex flex-wrap gap-3">
          <label htmlFor="division-step-input" className="sr-only">
            Step answer
          </label>
          <input
            id="division-step-input"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={stepInput}
            onChange={(event) => setStepInput(event.target.value)}
            disabled={isInputDisabled}
            className="w-40 rounded-md border border-emerald-600 bg-emerald-950 px-3 py-2 text-emerald-50 outline-none ring-emerald-400 transition focus:ring-2 disabled:cursor-not-allowed disabled:border-emerald-800 disabled:text-emerald-300"
            placeholder="Enter answer"
          />
          <button
            type="submit"
            disabled={isInputDisabled}
            className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-800 disabled:text-emerald-200"
          >
            Check Step
          </button>
          {workbenchState.pendingAdvance ? (
            <button
              type="button"
              onClick={handleAdvanceNowClick}
              className="rounded-md border border-lime-500 px-4 py-2 text-sm font-semibold text-lime-100 transition hover:bg-lime-900/40"
            >
              Next Problem Now
            </button>
          ) : null}
        </form>
      </div>

      <p
        role="status"
        aria-live="polite"
        className={`mt-4 rounded-md border px-3 py-2 text-sm ${getFeedbackClassName(workbenchState.feedback.tone)}`}
      >
        {workbenchState.feedback.message}
      </p>

      <div className="mt-4">
        <p className="text-xs uppercase tracking-[0.12em] text-emerald-200">
          Paper Trail
        </p>
        {recentAttempts.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {recentAttempts.map((attempt, index) => (
              <li
                key={`${attempt.step}-${attempt.cycleIndex}-${index}`}
                className={`rounded-md border px-3 py-2 text-sm ${
                  attempt.isCorrect
                    ? "border-emerald-600 bg-emerald-900/40 text-emerald-100"
                    : "border-amber-600 bg-amber-900/30 text-amber-100"
                }`}
              >
                <span className="font-semibold">
                  {getLongDivisionStepLabel(attempt.step)} ({attempt.cycleIndex + 1}):
                </span>{" "}
                {attempt.inputValue === null
                  ? "Input was invalid."
                  : `Entered ${attempt.inputValue}.`}
                {attempt.isCorrect
                  ? " Correct."
                  : ` Expected ${attempt.expectedValue}.`}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-emerald-100">
            Checked steps will appear here as you work through the problem.
          </p>
        )}
      </div>
    </section>
  );
}
