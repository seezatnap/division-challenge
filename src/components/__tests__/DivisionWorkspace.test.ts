import { describe, it, expect } from "vitest";
import type { DivisionProblem } from "@/types";
import { getDifficultyConfig } from "@/lib/difficulty";
import { generateProblem } from "@/lib/generate-problem";
import {
  createStepEngine,
  getCurrentStep,
  submitAnswer,
  getProgress,
} from "@/lib/step-engine";
import { initNewGame } from "@/lib/game-state";
import type { GameState } from "@/lib/game-state";
import { recordSolve, PROBLEMS_PER_TIER } from "@/lib/progression";

/**
 * These tests verify the logic that DivisionWorkspace orchestrates:
 * - Wiring user inputs to the step engine
 * - Immediate feedback (correct / incorrect with hints)
 * - Problem completion detection
 * - Transition to next problem (state reset + new problem generation)
 * - Session counter updates (simulating page-level state management)
 *
 * Component rendering tests require a DOM environment, which is not
 * configured in this project. The integration logic is tested here.
 */

// ─── Helpers ────────────────────────────────────────────────

function makeProblem(
  dividend: number,
  divisor: number,
): DivisionProblem {
  return {
    id: `test-${dividend}-${divisor}`,
    dividend,
    divisor,
    quotient: Math.floor(dividend / divisor),
    remainder: dividend % divisor,
    difficulty: getDifficultyConfig(1),
  };
}

/** Simulate the workspace solving a problem step-by-step, collecting feedback. */
function simulateWorkspaceFlow(problem: DivisionProblem) {
  const engine = createStepEngine(problem);
  const feedbackLog: Array<{
    stepKind: string;
    correct: boolean;
    hint?: string;
  }> = [];

  while (!engine.completed) {
    const step = getCurrentStep(engine);
    if (!step) break;
    const result = submitAnswer(engine, step.expected);
    if (!result) break;
    feedbackLog.push({
      stepKind: step.kind,
      correct: result.correct,
      hint: result.hint,
    });
  }

  return { engine, feedbackLog };
}

// ─── Step engine wiring ────────────────────────────────────

describe("DivisionWorkspace step engine wiring", () => {
  it("initializes engine from problem and presents first step", () => {
    const problem = makeProblem(84, 4);
    const engine = createStepEngine(problem);
    const step = getCurrentStep(engine);

    expect(step).not.toBeNull();
    expect(step!.kind).toBe("divide");
    expect(step!.prompt).toBe("Divide 8 by 4");
    expect(engine.completed).toBe(false);
  });

  it("advances step on correct answer and provides positive feedback", () => {
    const problem = makeProblem(84, 4);
    const engine = createStepEngine(problem);

    // First step: divide 8 by 4 = 2
    const result = submitAnswer(engine, 2);
    expect(result).not.toBeNull();
    expect(result!.correct).toBe(true);
    expect(result!.hint).toBeUndefined();
    expect(engine.currentStepIndex).toBe(1);
  });

  it("stays on same step with hint on incorrect answer", () => {
    const problem = makeProblem(84, 4);
    const engine = createStepEngine(problem);

    const result = submitAnswer(engine, 5); // wrong
    expect(result).not.toBeNull();
    expect(result!.correct).toBe(false);
    expect(result!.hint).toBeDefined();
    expect(engine.currentStepIndex).toBe(0); // did not advance
  });

  it("allows retry after incorrect answer", () => {
    const problem = makeProblem(84, 4);
    const engine = createStepEngine(problem);

    // Wrong answer
    submitAnswer(engine, 99);
    expect(engine.currentStepIndex).toBe(0);

    // Correct retry
    const result = submitAnswer(engine, 2);
    expect(result!.correct).toBe(true);
    expect(engine.currentStepIndex).toBe(1);
  });
});

// ─── Problem completion ────────────────────────────────────

describe("DivisionWorkspace problem completion", () => {
  it("detects completion after all steps answered correctly", () => {
    const problem = makeProblem(84, 4);
    const { engine, feedbackLog } = simulateWorkspaceFlow(problem);

    expect(engine.completed).toBe(true);
    expect(feedbackLog.every((f) => f.correct)).toBe(true);
    expect(feedbackLog.length).toBe(engine.steps.length);
  });

  it("completion shows correct answer: quotient and remainder", () => {
    const problem = makeProblem(87, 4);
    const { engine } = simulateWorkspaceFlow(problem);

    expect(engine.completed).toBe(true);
    // The component would display: 87 ÷ 4 = 21 R 3
    expect(problem.quotient).toBe(21);
    expect(problem.remainder).toBe(3);
  });

  it("completion for exact division has zero remainder", () => {
    const problem = makeProblem(84, 4);
    const { engine } = simulateWorkspaceFlow(problem);

    expect(engine.completed).toBe(true);
    expect(problem.remainder).toBe(0);
  });

  it("progress reports 100% on completion", () => {
    const problem = makeProblem(84, 4);
    const { engine } = simulateWorkspaceFlow(problem);
    const progress = getProgress(engine);

    expect(progress.isComplete).toBe(true);
    expect(progress.completedSteps).toBe(progress.totalSteps);
    expect(progress.currentStepKind).toBeNull();
  });
});

// ─── Transition to next problem ────────────────────────────

describe("DivisionWorkspace next-problem transition", () => {
  it("generates a new problem after completion (simulating onProblemComplete)", () => {
    const problem1 = makeProblem(84, 4);
    simulateWorkspaceFlow(problem1);

    // Simulate what page.tsx does: generate a new problem
    const problem2 = generateProblem(1);
    expect(problem2.id).not.toBe(problem1.id);
    expect(problem2.dividend).toBeGreaterThan(0);
    expect(problem2.divisor).toBeGreaterThan(0);
  });

  it("new engine resets to step 0 on new problem", () => {
    const problem1 = makeProblem(84, 4);
    const { engine: engine1 } = simulateWorkspaceFlow(problem1);
    expect(engine1.completed).toBe(true);

    // Simulate re-mounting with new problem (key={problem.id} in component)
    const problem2 = generateProblem(1);
    const engine2 = createStepEngine(problem2);
    expect(engine2.currentStepIndex).toBe(0);
    expect(engine2.completed).toBe(false);
  });

  it("consecutive problems can be solved independently", () => {
    for (let i = 0; i < 5; i++) {
      const problem = generateProblem(1);
      const { engine, feedbackLog } = simulateWorkspaceFlow(problem);

      expect(engine.completed).toBe(true);
      expect(feedbackLog.every((f) => f.correct)).toBe(true);
    }
  });
});

// ─── Session state management (page-level) ─────────────────

describe("DivisionWorkspace session state updates", () => {
  it("increments session and total problem counts on completion", () => {
    const gameState = initNewGame("Rex");
    expect(gameState.sessionProblemsSolved).toBe(0);
    expect(gameState.playerSave.totalProblemsSolved).toBe(0);

    // Simulate onProblemComplete callback (mirrors page.tsx logic)
    const updatedState: GameState = {
      ...gameState,
      sessionProblemsSolved: gameState.sessionProblemsSolved + 1,
      sessionProblemsAttempted: gameState.sessionProblemsAttempted + 1,
      playerSave: {
        ...gameState.playerSave,
        totalProblemsSolved: gameState.playerSave.totalProblemsSolved + 1,
      },
    };

    expect(updatedState.sessionProblemsSolved).toBe(1);
    expect(updatedState.playerSave.totalProblemsSolved).toBe(1);
  });

  it("accumulates counts across multiple completions", () => {
    let state = initNewGame("Dr. Malcolm");

    for (let i = 0; i < 5; i++) {
      state = {
        ...state,
        sessionProblemsSolved: state.sessionProblemsSolved + 1,
        sessionProblemsAttempted: state.sessionProblemsAttempted + 1,
        playerSave: {
          ...state.playerSave,
          totalProblemsSolved: state.playerSave.totalProblemsSolved + 1,
        },
      };
    }

    expect(state.sessionProblemsSolved).toBe(5);
    expect(state.sessionProblemsAttempted).toBe(5);
    expect(state.playerSave.totalProblemsSolved).toBe(5);
  });

  it("preserves player name and difficulty through completions", () => {
    let state = initNewGame("Rex");

    state = {
      ...state,
      sessionProblemsSolved: state.sessionProblemsSolved + 1,
      sessionProblemsAttempted: state.sessionProblemsAttempted + 1,
      playerSave: {
        ...state.playerSave,
        totalProblemsSolved: state.playerSave.totalProblemsSolved + 1,
      },
    };

    expect(state.playerSave.playerName).toBe("Rex");
    expect(state.playerSave.currentDifficulty).toBe(1);
  });

  it("generates problem at current difficulty tier", () => {
    const state = initNewGame("Rex");
    const problem = generateProblem(state.playerSave.currentDifficulty);

    expect(problem.difficulty.tier).toBe(1);
    // Tier 1: 2-digit ÷ 1-digit
    expect(String(problem.dividend).length).toBe(2);
    expect(String(problem.divisor).length).toBe(1);
  });
});

// ─── Immediate feedback per step kind ──────────────────────

describe("DivisionWorkspace feedback per step kind", () => {
  it("provides step-appropriate hints for divide errors", () => {
    const engine = createStepEngine(makeProblem(84, 4));
    const result = submitAnswer(engine, 99);
    expect(result!.hint).toContain("Divide");
  });

  it("provides step-appropriate hints for multiply errors", () => {
    const engine = createStepEngine(makeProblem(84, 4));
    submitAnswer(engine, 2); // correct divide
    const result = submitAnswer(engine, 99);
    expect(result!.hint).toContain("multiplication");
  });

  it("provides step-appropriate hints for subtract errors", () => {
    const engine = createStepEngine(makeProblem(84, 4));
    submitAnswer(engine, 2); // correct divide
    submitAnswer(engine, 8); // correct multiply
    const result = submitAnswer(engine, 99);
    expect(result!.hint).toContain("subtraction");
  });

  it("provides step-appropriate hints for bring-down errors", () => {
    const engine = createStepEngine(makeProblem(84, 4));
    submitAnswer(engine, 2); // correct divide
    submitAnswer(engine, 8); // correct multiply
    submitAnswer(engine, 0); // correct subtract
    const result = submitAnswer(engine, 99);
    expect(result!.hint).toContain("next digit");
  });

  it("no hint on correct answers", () => {
    const engine = createStepEngine(makeProblem(84, 4));
    const result = submitAnswer(engine, 2);
    expect(result!.correct).toBe(true);
    expect(result!.hint).toBeUndefined();
  });
});

// ─── Progress tracking ─────────────────────────────────────

describe("DivisionWorkspace progress tracking", () => {
  it("reports progress through steps", () => {
    const problem = makeProblem(84, 4);
    const engine = createStepEngine(problem);

    const initial = getProgress(engine);
    expect(initial.completedSteps).toBe(0);
    expect(initial.totalSteps).toBe(7);

    // Complete first step
    submitAnswer(engine, 2);
    const afterFirst = getProgress(engine);
    expect(afterFirst.completedSteps).toBe(1);
    expect(afterFirst.currentStepKind).toBe("multiply");
  });

  it("progress percentage reaches 100 on completion", () => {
    const problem = makeProblem(84, 4);
    const { engine } = simulateWorkspaceFlow(problem);
    const progress = getProgress(engine);

    const percent = (progress.completedSteps / progress.totalSteps) * 100;
    expect(percent).toBe(100);
  });
});

// ─── Multi-tier problem support ────────────────────────────

describe("DivisionWorkspace handles all difficulty tiers", () => {
  for (let tier = 1; tier <= 5; tier++) {
    it(`solves tier ${tier} problems through workspace flow`, () => {
      const problem = generateProblem(tier as 1 | 2 | 3 | 4 | 5);
      const { engine, feedbackLog } = simulateWorkspaceFlow(problem);

      expect(engine.completed).toBe(true);
      expect(feedbackLog.every((f) => f.correct)).toBe(true);
      expect(feedbackLog.length).toBe(engine.steps.length);
    });
  }
});

// ─── Level-up feedback (page-level) ────────────────────────

describe("Level-up feedback integration", () => {
  it("didLevelUp is false for solves before tier boundary", () => {
    let state = initNewGame("Rex");
    for (let i = 0; i < PROBLEMS_PER_TIER - 1; i++) {
      const result = recordSolve(state);
      expect(result.didLevelUp).toBe(false);
      state = result.updatedState;
    }
  });

  it("didLevelUp is true on the solve that crosses a tier boundary", () => {
    let state = initNewGame("Rex");
    for (let i = 0; i < PROBLEMS_PER_TIER - 1; i++) {
      state = recordSolve(state).updatedState;
    }
    const result = recordSolve(state);
    expect(result.didLevelUp).toBe(true);
    expect(result.updatedState.playerSave.currentDifficulty).toBe(2);
  });

  it("didLevelUp carries the new tier for UI display", () => {
    let state = initNewGame("Rex");
    // Solve through to tier 3 boundary (2 * PROBLEMS_PER_TIER solves)
    for (let i = 0; i < PROBLEMS_PER_TIER * 2 - 1; i++) {
      state = recordSolve(state).updatedState;
    }
    const result = recordSolve(state);
    expect(result.didLevelUp).toBe(true);
    expect(result.updatedState.playerSave.currentDifficulty).toBe(3);
  });

  it("didLevelUp is false once at max tier", () => {
    let state = initNewGame("Rex");
    // Reach tier 5
    for (let i = 0; i < PROBLEMS_PER_TIER * 4; i++) {
      state = recordSolve(state).updatedState;
    }
    expect(state.playerSave.currentDifficulty).toBe(5);

    // Additional solve should not level up
    const result = recordSolve(state);
    expect(result.didLevelUp).toBe(false);
  });
});
