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

// ─── Encouragement Messages ────────────────────────────────

const SUCCESS_MESSAGES = [
  "Roarsome!",
  "You're dino-mite!",
  "Rawr-ight on!",
  "T-Riffic!",
  "Jurassic genius!",
  "Clever girl!",
  "Dino-score!",
  "Steg-tacular!",
  "Raptor speed!",
  "Tricer-tops work!",
];

const ERROR_MESSAGES = [
  "Uh oh, the raptor got that one…",
  "Even a T-Rex stumbles sometimes!",
  "Try again, dino explorer!",
  "The fossils say otherwise…",
  "Not quite — dig deeper!",
];

function randomMessage(messages: string[]): string {
  return messages[Math.floor(Math.random() * messages.length)];
}

// ─── Step Label ────────────────────────────────────────────

const STEP_LABELS: Record<string, string> = {
  divide: "Divide",
  multiply: "Multiply",
  subtract: "Subtract",
  "bring-down": "Bring Down",
};

const STEP_COLORS: Record<string, string> = {
  divide: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  multiply:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
  subtract:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  "bring-down":
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
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
      <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-zinc-700 dark:text-zinc-300">
            Long Division
          </h2>
          <span className="text-sm text-zinc-500">
            {problem.difficulty.label}
          </span>
        </div>

        {/* Visual Division Layout */}
        <div
          className="mb-4 flex items-center justify-center font-mono text-3xl font-bold"
          aria-label={`${problem.dividend} divided by ${problem.divisor}`}
        >
          <span className="mr-3 text-zinc-500">{problem.divisor}</span>
          <span className="text-zinc-400">)</span>
          <span className="border-t-2 border-zinc-700 px-2 dark:border-zinc-300">
            {problem.dividend}
          </span>
        </div>

        {/* Progress Bar */}
        <div className="mb-2">
          <div className="flex items-center justify-between text-xs text-zinc-500">
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
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full rounded-full bg-green-600 transition-all duration-300"
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
        <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
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
              className="flex-1 rounded border border-zinc-300 px-3 py-2 text-base font-mono focus:border-green-600 focus:outline-none focus:ring-1 focus:ring-green-600 dark:border-zinc-600 dark:bg-zinc-800 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
              aria-describedby={feedback ? "step-feedback" : undefined}
            />
            <button
              type="submit"
              className="rounded bg-green-700 px-4 py-2 font-semibold text-white transition-colors hover:bg-green-800"
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
                  ? "border-green-300 bg-green-50 text-green-800 dark:border-green-700 dark:bg-green-900/30 dark:text-green-300"
                  : "border-red-300 bg-red-50 text-red-800 dark:border-red-700 dark:bg-red-900/30 dark:text-red-300"
              }`}
              data-testid="step-feedback"
            >
              <p className="font-semibold">{feedback.message}</p>
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
        <div className="rounded-lg border border-green-300 bg-green-50 p-6 text-center shadow-lg dark:border-green-700 dark:bg-green-900/20">
          <p
            className="mb-2 text-2xl font-bold text-green-800 dark:text-green-300"
            data-testid="completion-message"
          >
            Problem Complete!
          </p>
          <p className="mb-1 text-lg text-green-700 dark:text-green-400">
            {problem.dividend} &divide; {problem.divisor} ={" "}
            <strong>{problem.quotient}</strong>
            {problem.remainder > 0 && (
              <span> R {problem.remainder}</span>
            )}
          </p>
          <p className="mb-4 text-sm text-green-600 dark:text-green-500">
            {randomMessage(SUCCESS_MESSAGES)}
          </p>
          <button
            type="button"
            onClick={handleNextProblem}
            autoFocus
            className="rounded bg-green-700 px-6 py-2 font-semibold text-white transition-colors hover:bg-green-800"
            data-testid="next-problem-button"
          >
            Next Problem
          </button>
        </div>
      )}
    </div>
  );
}
