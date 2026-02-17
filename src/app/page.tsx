import { featureModules } from "@/features";
import { solveLongDivision } from "@/features/division-engine";
import {
  SAVE_FILE_SCHEMA_VERSION,
  type DinoDivisionSaveFile,
  type DivisionProblem,
} from "@/features/contracts";
import { GameStartFlowPanel } from "@/features/persistence";
import { EarnedRewardRevealPanel } from "@/features/rewards";
import { LiveDivisionWorkspacePanel } from "@/features/workspace-ui";

const galleryPreview = [
  {
    dinosaurName: "Tyrannosaurus Rex",
    earnedAt: "Feb 12",
    style: "gallery-thumb-rex",
  },
  {
    dinosaurName: "Velociraptor",
    earnedAt: "Feb 14",
    style: "gallery-thumb-raptor",
  },
  {
    dinosaurName: "Brachiosaurus",
    earnedAt: "Feb 16",
    style: "gallery-thumb-brachio",
  },
];

const loadableSavePreview: DinoDivisionSaveFile = {
  schemaVersion: SAVE_FILE_SCHEMA_VERSION,
  playerName: "Raptor Scout",
  totalProblemsSolved: 28,
  currentDifficultyLevel: 4,
  progress: {
    session: {
      sessionId: "session-preview-active",
      startedAt: "2026-02-17T09:15:00.000Z",
      solvedProblems: 6,
      attemptedProblems: 8,
    },
    lifetime: {
      totalProblemsSolved: 28,
      totalProblemsAttempted: 34,
      currentDifficultyLevel: 4,
      rewardsUnlocked: 5,
    },
  },
  unlockedDinosaurs: [
    {
      rewardId: "reward-rex-1",
      dinosaurName: "Tyrannosaurus Rex",
      imagePath: "/rewards/tyrannosaurus-rex.png",
      earnedAt: "2026-02-12T09:15:00.000Z",
      milestoneSolvedCount: 5,
    },
    {
      rewardId: "reward-raptor-2",
      dinosaurName: "Velociraptor",
      imagePath: "/rewards/velociraptor.png",
      earnedAt: "2026-02-14T12:40:00.000Z",
      milestoneSolvedCount: 10,
    },
  ],
  sessionHistory: [
    {
      sessionId: "session-preview-1",
      startedAt: "2026-02-12T08:00:00.000Z",
      endedAt: "2026-02-12T08:45:00.000Z",
      solvedProblems: 10,
      attemptedProblems: 12,
    },
    {
      sessionId: "session-preview-2",
      startedAt: "2026-02-14T12:00:00.000Z",
      endedAt: "2026-02-14T12:55:00.000Z",
      solvedProblems: 18,
      attemptedProblems: 22,
    },
  ],
  updatedAt: "2026-02-17T09:15:00.000Z",
};

const workspacePreviewProblem: DivisionProblem = {
  id: "workspace-preview-problem",
  dividend: 432,
  divisor: 12,
  allowRemainder: false,
  difficultyLevel: 2,
};

const workspacePreviewSolution = solveLongDivision(workspacePreviewProblem);

export default function Home() {
  return (
    <main className="jurassic-shell">
      <div className="jurassic-content">
        <header className="jurassic-panel jurassic-hero motif-canopy">
          <p className="eyebrow">Dino Division v2</p>
          <h1 className="hero-title">Jurassic Command Deck</h1>
          <p className="hero-copy">
            Earth-tone surfaces, jungle overlays, and amber-glow focus states now span the live game board, reward
            gallery, and save/load controls for both handheld and desktop play.
          </p>
          <div className="hero-badges">
            <span className="jp-badge">Earth + Jungle Palette</span>
            <span className="jp-badge">Themed Typography</span>
            <span className="jp-badge">Motif Overlays</span>
          </div>
        </header>

        <div className="jurassic-layout">
          <section
            aria-labelledby="game-surface-heading"
            className="jurassic-panel motif-claw"
            data-ui-surface="game"
          >
            <div className="surface-header">
              <div>
                <p className="surface-kicker">Game Workspace</p>
                <h2 className="surface-title" id="game-surface-heading">
                  Amber Glow Division Board
                </h2>
              </div>
              <p className="status-chip">Live target: quotient digit</p>
            </div>

            <LiveDivisionWorkspacePanel
              dividend={workspacePreviewProblem.dividend}
              divisor={workspacePreviewProblem.divisor}
              steps={workspacePreviewSolution.steps}
            />
          </section>

          <div className="side-stack">
            <section
              aria-labelledby="gallery-surface-heading"
              className="jurassic-panel motif-fossil"
              data-ui-surface="gallery"
            >
              <div className="surface-header">
                <div>
                  <p className="surface-kicker">Dino Gallery</p>
                  <h2 className="surface-title" id="gallery-surface-heading">
                    Unlocked Species
                  </h2>
                </div>
              </div>

              <div className="gallery-grid">
                {galleryPreview.map((entry) => (
                  <article className="gallery-card" key={entry.dinosaurName}>
                    <div aria-hidden="true" className={`gallery-thumb ${entry.style}`} />
                    <p className="gallery-name">{entry.dinosaurName}</p>
                    <p className="gallery-meta">Earned {entry.earnedAt}</p>
                  </article>
                ))}
              </div>
            </section>

            <section
              aria-labelledby="earned-reward-surface-heading"
              className="jurassic-panel motif-canopy"
              data-ui-surface="earned-reward"
            >
              <div className="surface-header">
                <div>
                  <p className="surface-kicker">Reward Hatch</p>
                  <h2 className="surface-title" id="earned-reward-surface-heading">
                    Newly Earned Dino
                  </h2>
                </div>
              </div>

              <EarnedRewardRevealPanel
                dinosaurName="Stegosaurus"
                initialStatus="generating"
                maxPollAttempts={2}
                milestoneSolvedCount={15}
                pollIntervalMs={200}
              />
            </section>

            <section
              aria-labelledby="save-surface-heading"
              className="jurassic-panel motif-track"
              data-ui-surface="save-load"
            >
              <div className="surface-header">
                <div>
                  <p className="surface-kicker">Save + Load</p>
                  <h2 className="surface-title" id="save-surface-heading">
                    Expedition Files
                  </h2>
                </div>
              </div>

              <GameStartFlowPanel loadableSave={loadableSavePreview} />
            </section>
          </div>
        </div>

        <section aria-labelledby="module-map-heading" className="jurassic-panel module-map">
          <h2 className="surface-title" id="module-map-heading">
            Feature Module Map
          </h2>
          <ul className="module-grid">
            {featureModules.map((module) => (
              <li className="module-card" key={module.id}>
                <p className="module-title">{module.title}</p>
                <p className="module-summary">{module.summary}</p>
                <p className="module-path">{module.rootPath}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
