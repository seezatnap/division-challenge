"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import type { DivisionProblem, StepValidationResult } from "@/types";
import {
  createStepEngine,
  getCurrentStep,
  submitAnswer,
  getProgress,
} from "@/lib/step-engine";
import type { StepEngineState } from "@/lib/step-engine";
import {
  SUCCESS_MESSAGES,
  ERROR_MESSAGES,
  COMPLETION_MESSAGES,
  MOTIFS,
  randomMessage,
} from "@/lib/theme";

// ─── Step Label ────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  divide: "Divide",
  multiply: "Multiply",
  subtract: "Subtract",
  "bring-down": "Bring Down",
};

const STEP_COLORS: Record<string, string> = {
  divide: "bg-jungle/10 text-jungle dark:bg-jungle/20 dark:text-leaf",
  multiply:
    "bg-amber-accent/10 text-amber-accent dark:bg-amber-accent/20 dark:text-sand",
  subtract:
    "bg-earth/10 text-earth dark:bg-earth/20 dark:text-fossil",
  "bring-down":
    "bg-leaf/10 text-fern dark:bg-leaf/20 dark:text-leaf",
};

// ─── Props ─────────────────────────────────────────────────

export interface DivisionWorkspaceProps {
  problem: DivisionProblem;
  onProblemComplete: (problem: DivisionProblem) => void;
}

// ─── Component ─────────────────────────────────────────────

export default function DivisionWorkspace({
  problem,
  onProblemComplete,
}: DivisionWorkspaceProps) {
  const [engine, setEngine] = useState<StepEngineState>(() =>
    createStepEngine(problem),
  );
  const [inputValue, setInputValue] = useState("");
  const [feedback, setFeedback] = useState<{
    result: StepValidationResult;
    message: string;
  } | null>(null);
  const [showCompletion, setShowCompletion] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when step changes (component is remounted on new problem via key={problem.id})
  useEffect(() => {
    if (!showCompletion && inputRef.current) {
      inputRef.current.focus();
    }
  }, [engine.currentStepIndex, showCompletion]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      const trimmed = inputValue.trim();
      if (trimmed === "") return;

      const parsed = parseInt(trimmed, 10);
      if (isNaN(parsed)) return;

      // We must work with a mutable copy because submitAnswer mutates state
      const engineCopy: StepEngineState = {
        ...engine,
        steps: engine.steps,
      };

      const result = submitAnswer(engineCopy, parsed);
      if (!result) return;

      if (result.correct) {
        setFeedback({
          result,
          message: randomMessage(SUCCESS_MESSAGES),
        });
        setEngine({ ...engineCopy });
        setInputValue("");

        // Check if problem is now complete
        if (engineCopy.completed) {
          setShowCompletion(true);
        } else {
          // Clear feedback after a brief moment on correct answers
          setTimeout(() => setFeedback(null), 800);
        }
      } else {
        setFeedback({
          result,
          message: randomMessage(ERROR_MESSAGES),
        });
        setInputValue("");
      }
    },
    [engine, inputValue],
  );

  const handleNextProblem = useCallback(() => {
    setTransitioning(true);
    // Brief transition animation delay
    setTimeout(() => {
      onProblemComplete(problem);
    }, 300);
  }, [onProblemComplete, problem]);

  const currentStep = getCurrentStep(engine);
  const progress = getProgress(engine);

  return (
    <div
      className={`w-full max-w-lg transition-opacity duration-300 ${transitioning ? "opacity-0" : "opacity-100"}`}
      role="region"
      aria-label="Division workspace"
    >
      {/* Problem Display */}
      <div className="mb-6 rounded-lg border border-earth/20 bg-ivory p-6 shadow-lg dark:border-earth/30 dark:bg-sand">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-bold text-jungle dark:text-leaf">
            {MOTIFS.leaf} Long Division
          </h2>
          <span className="text-sm text-fossil">
            {problem.difficulty.label}
          </span>
        </div>

        {/* Visual Division Layout */}
        <div
          className="mb-4 flex items-center justify-center font-mono text-3xl font-bold"
          aria-label={`${problem.dividend} divided by ${problem.divisor}`}
        >
          <span className="mr-3 text-fossil">{problem.divisor}</span>
          <span className="text-earth/60">)</span>
          <span className="border-t-2 border-jungle px-2 dark:border-leaf">
            {problem.dividend}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs text-fossil">
            <span>
              Step {progress.completedSteps} of {progress.totalSteps}
            </span>
            <span>
              {Math.round(
                (progress.completedSteps / progress.totalSteps) * 100,
              )}
              %
            </span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-sand dark:bg-earth/30">
            <div
              className="h-full rounded-full bg-jungle transition-all duration-300"
              style={{
                width: `${(progress.completedSteps / progress.totalSteps) * 100}%`,
              }}
              role="progressbar"
              aria-valuenow={progress.completedSteps}
              aria-valuemin={0}
              aria-valuemax={progress.totalSteps}
            />
          </div>
        </div>
      </div>

      {/* Step Interaction Area */}
      {!showCompletion && currentStep && (
        <div className="rounded-lg border border-earth/20 bg-ivory p-6 shadow-lg dark:border-earth/30 dark:bg-sand">
          {/* Step Badge */}
          <div className="mb-3 flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${STEP_COLORS[currentStep.kind]}`}
            >
              {STEP_LABELS[currentStep.kind]}
            </span>
          </div>

          {/* Step Prompt */}
          <p className="mb-4 text-lg font-medium" data-testid="step-prompt">
            {currentStep.prompt}
          </p>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <label htmlFor="step-answer" className="sr-only">
              Your answer
            </label>
            <input
              ref={inputRef}
              id="step-answer"
              type="number"
              inputMode="numeric"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Your answer"
              autoFocus
              className="flex-1 rounded border border-earth/30 bg-background px-3 py-2 text-base font-mono focus:border-jungle focus:outline-none focus:ring-1 focus:ring-jungle dark:border-earth/40 dark:bg-background [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              aria-describedby={feedback ? "step-feedback" : undefined}
            />
            <button
              type="submit"
              className="rounded bg-jungle px-4 py-2 font-semibold text-white transition-colors hover:bg-jungle-light"
            >
              Check
            </button>
          </form>

          {/* Feedback */}
          {feedback && (
            <div
              id="step-feedback"
              role="status"
              aria-live="polite"
              className={`mt-4 rounded border p-3 text-sm ${
                feedback.result.correct
                  ? "border-leaf/40 bg-leaf/10 text-jungle dark:border-leaf/30 dark:bg-fern/30 dark:text-leaf"
                  : "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
              }`}
              data-testid="step-feedback"
            >
              <p className="font-semibold">{feedback.result.correct ? MOTIFS.trex : MOTIFS.volcano} {feedback.message}</p>
              {feedback.result.hint && (
                <p className="mt-1 text-xs opacity-90">
                  {feedback.result.hint}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Completion State */}
      {showCompletion && (
        <div className="rounded-lg border border-leaf/40 bg-leaf/10 p-6 text-center shadow-lg dark:border-leaf/30 dark:bg-fern/20">
          <p
            className="mb-2 text-2xl font-bold text-jungle dark:text-leaf"
            data-testid="completion-message"
          >
            {MOTIFS.trex} Problem Complete!
          </p>
          <p className="mb-1 text-lg text-jungle dark:text-leaf">
            {problem.dividend} &divide; {problem.divisor} ={" "}
            <strong>{problem.quotient}</strong>
            {problem.remainder > 0 && (
              <span> R {problem.remainder}</span>
            )}
          </p>
          <p className="mb-4 text-sm text-fossil">
            {randomMessage(COMPLETION_MESSAGES)}
          </p>
          <button
            type="button"
            onClick={handleNextProblem}
            autoFocus
            className="rounded bg-jungle px-6 py-2 font-semibold text-white transition-colors hover:bg-jungle-light"
            data-testid="next-problem-button"
          >
            {MOTIFS.footprint} Next Problem
          </button>
        </div>
      )}
    </div>
  );
}
