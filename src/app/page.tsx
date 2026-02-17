import { featureModules } from "@/features";

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

const savePreview = [
  {
    playerName: "Raptor Scout",
    summary: "Solved 28 problems | Difficulty 4",
    updatedAt: "Updated 09:15",
  },
  {
    playerName: "Amber Ranger",
    summary: "Solved 13 problems | Difficulty 2",
    updatedAt: "Updated 07:42",
  },
];

const coachMessages = [
  "Roarsome lock-in! Keep the amber glow moving.",
  "Clever girl... your subtraction line is perfect.",
  "The T-Rex says: multiply one more time!",
];

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

            <div className="game-grid">
              <article aria-label="Long-division board preview" className="workspace-paper">
                <div className="workspace-lineup">
                  <p className="workspace-label">Quotient</p>
                  <div className="digit-track">
                    <span className="digit-cell">3</span>
                    <span className="digit-cell">6</span>
                    <span className="digit-cell glow-amber">?</span>
                  </div>
                </div>

                <div className="bus-stop">
                  <p className="divisor-cell">12</p>
                  <div className="bracket-stack">
                    <p className="dividend-line">432</p>
                    <p className="work-line">-36</p>
                    <p className="work-line">72</p>
                    <p className="work-line">-72</p>
                    <p className="work-line final-line">0</p>
                  </div>
                </div>
              </article>

              <aside className="hint-stack">
                <h3 className="hint-title">Dino Coach</h3>
                <ul className="coach-list">
                  {coachMessages.map((message) => (
                    <li key={message} className="coach-item">
                      {message}
                    </li>
                  ))}
                </ul>
                <p className="hint-note">Numbers lock in instantly, then the glow slides to the next required cell.</p>
              </aside>
            </div>
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

              <div className="save-actions">
                <button className="jp-button" type="button">
                  Save Progress
                </button>
                <button className="jp-button jp-button-secondary" type="button">
                  Load File
                </button>
              </div>

              <ul className="save-list">
                {savePreview.map((entry) => (
                  <li className="save-item" key={entry.playerName}>
                    <p className="save-name">{entry.playerName}</p>
                    <p className="save-summary">{entry.summary}</p>
                    <p className="save-updated">{entry.updatedAt}</p>
                  </li>
                ))}
              </ul>
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
