import { solveLongDivision } from "@/features/division-engine";
import type { DivisionProblem } from "@/features/contracts";
import { LiveDivisionWorkspacePanel } from "@/features/workspace-ui/components/live-division-workspace-panel";
import { BusStopLongDivisionRenderer } from "@/features/workspace-ui/components/bus-stop-long-division-renderer";

const visualTestProblem: DivisionProblem = {
  id: "workspace-preview-problem",
  dividend: 432,
  divisor: 12,
  allowRemainder: false,
  difficultyLevel: 2,
};

const visualTestSolution = solveLongDivision(visualTestProblem);

export default function WorkspaceVisualTestPage() {
  return (
    <main className="jurassic-shell">
      <div className="jurassic-content">
        <section className="jurassic-panel" data-visual-snapshot="workspace-live">
          <LiveDivisionWorkspacePanel
            dividend={visualTestProblem.dividend}
            divisor={visualTestProblem.divisor}
            steps={visualTestSolution.steps}
          />
        </section>

        <section className="jurassic-panel" data-visual-snapshot="workspace-solved">
          <BusStopLongDivisionRenderer
            dividend={visualTestProblem.dividend}
            divisor={visualTestProblem.divisor}
            enableLiveTyping={false}
            revealedStepCount={visualTestSolution.steps.length}
            steps={visualTestSolution.steps}
          />
        </section>
      </div>
    </main>
  );
}
