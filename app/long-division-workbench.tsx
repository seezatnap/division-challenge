"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

import {
  DIVISION_DIFFICULTIES,
  type DivisionDifficultyId,
} from "@/lib/domain";
import {
  advanceLongDivisionWorkbenchProblem,
  buildLongDivisionStepPrompt,
  createLongDivisionWorkbenchState,
  getLongDivisionStepLabel,
  LONG_DIVISION_REWARD_INTERVAL,
  type LongDivisionWorkbenchRewardTrigger,
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
  lifetimeSolvedCount?: number;
  onProgressChange?: (progress: {
    difficulty: DivisionDifficultyId;
    solvedCount: number;
    lifetimeSolvedCount: number;
  }) => void;
  onRewardTrigger?: (rewardTrigger: LongDivisionWorkbenchRewardTrigger) => void;
}

function getFeedbackClassName(tone: string): string {
  if (tone === "success") {
    return "dino-status-success";
  }

  if (tone === "error") {
    return "dino-status-error";
  }

  if (tone === "complete") {
    return "dino-status-complete";
  }

  return "dino-status-idle";
}

export default function LongDivisionWorkbench({
  difficulty,
  lifetimeSolvedCount = 0,
  onProgressChange,
  onRewardTrigger,
}: LongDivisionWorkbenchProps) {
  const [workbenchState, setWorkbenchState] = useState(() =>
    createLongDivisionWorkbenchState({
      difficulty,
      lifetimeSolvedCount,
    }),
  );
  const [stepInput, setStepInput] = useState("");
  const emittedRewardTriggerKeysRef = useRef<Set<string>>(new Set());

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

  useEffect(() => {
    if (!onProgressChange) {
      return;
    }

    onProgressChange({
      difficulty: workbenchState.difficulty,
      solvedCount: workbenchState.solvedCount,
      lifetimeSolvedCount: workbenchState.lifetimeSolvedCount,
    });
  }, [
    onProgressChange,
    workbenchState.difficulty,
    workbenchState.lifetimeSolvedCount,
    workbenchState.solvedCount,
  ]);

  useEffect(() => {
    if (!onRewardTrigger || !workbenchState.pendingRewardTrigger) {
      return;
    }

    const trigger = workbenchState.pendingRewardTrigger;
    const triggerKey = `${trigger.rewardIndex}:${trigger.lifetimeSolvedCount}`;

    if (emittedRewardTriggerKeysRef.current.has(triggerKey)) {
      return;
    }

    emittedRewardTriggerKeysRef.current.add(triggerKey);
    onRewardTrigger(trigger);
  }, [onRewardTrigger, workbenchState.pendingRewardTrigger]);

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
  const solvedSinceReward =
    workbenchState.lifetimeSolvedCount % LONG_DIVISION_REWARD_INTERVAL;
  const solvesUntilNextReward = solvedSinceReward === 0
    ? LONG_DIVISION_REWARD_INTERVAL
    : LONG_DIVISION_REWARD_INTERVAL - solvedSinceReward;
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
    <section className="jurassic-card mt-6 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="jurassic-heading text-lg font-semibold">
          Work on Paper Practice
        </h3>
        <p className="jurassic-copy text-sm">
          Solved this run:{" "}
          <span className="font-semibold">{workbenchState.solvedCount}</span>{" "}
          | Lifetime solved:{" "}
          <span className="font-semibold">{workbenchState.lifetimeSolvedCount}</span>
        </p>
      </div>
      <p className="fossil-label mt-2">
        Next reward in {solvesUntilNextReward} solved problem
        {solvesUntilNextReward === 1 ? "" : "s"}
      </p>

      <div
        key={workbenchState.problem.id}
        className={`jurassic-card mt-4 p-4 transition-opacity duration-300 ${
          workbenchState.pendingAdvance ? "opacity-70" : "opacity-100"
        }`}
      >
        <p className="fossil-label">
          Current Problem
        </p>
        <div className="mt-2 flex items-start text-3xl font-black text-[var(--sandstone)]">
          <span className="pr-3">{workbenchState.problem.divisor}</span>
          <span className="border-l-2 border-t-2 border-amber-200/70 px-3 py-1">
            {workbenchState.problem.dividend}
          </span>
        </div>
        <p className="jurassic-copy mt-2 text-sm">
          Difficulty: {difficultyLabel}
        </p>
        <p className="jurassic-copy mt-1 text-sm">
          Step Progress: {completedStepCount}/{totalStepCount}
        </p>
      </div>

      <div className="jurassic-card mt-4 p-4">
        <p className="fossil-label">
          Current Step
        </p>
        {currentStep ? (
          <>
            <p className="mt-2 text-sm font-semibold text-[var(--sandstone)]">
              {getLongDivisionStepLabel(currentStep.step)} (cycle{" "}
              {currentStep.cycleIndex + 1})
            </p>
            <p className="jurassic-copy mt-1 text-sm">
              {buildLongDivisionStepPrompt(currentStep)}
            </p>
          </>
        ) : (
          <p className="jurassic-copy mt-2 text-sm">
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
            className="dino-input w-40"
            placeholder="Enter answer"
          />
          <button
            type="submit"
            disabled={isInputDisabled}
            className="dino-button-primary px-4 py-2 text-sm"
          >
            Check Step
          </button>
          {workbenchState.pendingAdvance ? (
            <button
              type="button"
              onClick={handleAdvanceNowClick}
              className="dino-button-secondary px-4 py-2 text-sm"
            >
              Next Problem Now
            </button>
          ) : null}
        </form>
      </div>

      <p
        role="status"
        aria-live="polite"
        className={`dino-status mt-4 ${getFeedbackClassName(workbenchState.feedback.tone)}`}
      >
        {workbenchState.feedback.message}
      </p>

      <div className="mt-4">
        <p className="fossil-label">
          Paper Trail
        </p>
        {recentAttempts.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {recentAttempts.map((attempt, index) => (
              <li
                key={`${attempt.step}-${attempt.cycleIndex}-${index}`}
                className={`rounded-md border px-3 py-2 text-sm ${
                  attempt.isCorrect ? "dino-attempt-success" : "dino-attempt-error"
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
          <p className="jurassic-copy mt-2 text-sm">
            Checked steps will appear here as you work through the problem.
          </p>
        )}
      </div>
    </section>
  );
}
