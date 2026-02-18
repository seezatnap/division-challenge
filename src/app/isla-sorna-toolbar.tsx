"use client";

export interface IslaSornaToolbarStats {
  problemsSolved: number;
  currentStreak: number;
  difficultyLevel: number;
}

/**
 * Persistent bottom toolbar matching the "ISLA SORNA SURVEILLANCE DEVICE"
 * bar from the JP3 Research Center comp.
 */
export function IslaSornaToolbar(props: {
  stats?: IslaSornaToolbarStats;
}) {
  const { stats } = props;

  return (
    <nav
      aria-label="Isla Sorna Surveillance Device"
      className="isla-sorna-toolbar"
      data-ui-surface="toolbar"
    >
      <span className="toolbar-label">Isla Sorna Surveillance Device</span>

      {stats ? (
        <div className="toolbar-readouts" data-testid="toolbar-readouts">
          <span className="toolbar-readout">
            <span className="toolbar-readout-label">Solved</span>
            <span className="toolbar-readout-value" data-stat="problems-solved">
              {stats.problemsSolved}
            </span>
          </span>
          <span className="toolbar-readout">
            <span className="toolbar-readout-label">Streak</span>
            <span className="toolbar-readout-value" data-stat="current-streak">
              {stats.currentStreak}
            </span>
          </span>
          <span className="toolbar-readout">
            <span className="toolbar-readout-label">Lvl</span>
            <span className="toolbar-readout-value" data-stat="difficulty-level">
              {stats.difficultyLevel}
            </span>
          </span>
        </div>
      ) : null}

      <div className="toolbar-icons">
        <button
          aria-label="Footprint"
          className="toolbar-icon-btn"
          type="button"
        >
          <svg
            aria-hidden="true"
            className="toolbar-icon-svg"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <ellipse cx="9" cy="6" rx="2.5" ry="3.5" />
            <ellipse cx="15" cy="6" rx="2.5" ry="3.5" />
            <path d="M7 14c0-2 2-4 5-4s5 2 5 4c0 3-2 6-5 7-3-1-5-4-5-7Z" />
          </svg>
        </button>

        <button
          aria-label="Fossil"
          className="toolbar-icon-btn"
          type="button"
        >
          <svg
            aria-hidden="true"
            className="toolbar-icon-svg"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path d="M5 19c1-3 2-5 4-6" />
            <path d="M9 13c2-1 5-1 7 0" />
            <path d="M16 13c2 1 3 3 3 6" />
            <circle cx="7" cy="8" r="2" />
            <circle cx="17" cy="8" r="2" />
            <path d="M7 10v3M17 10v3M12 6v7" />
          </svg>
        </button>

        <button
          aria-label="DNA Helix"
          className="toolbar-icon-btn"
          type="button"
        >
          <svg
            aria-hidden="true"
            className="toolbar-icon-svg"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path d="M8 2c0 4 2 6 4 8s4 4 4 8" />
            <path d="M16 2c0 4-2 6-4 8s-4 4-4 8" />
            <path d="M7 7h10M7 12h10M7 17h10" />
          </svg>
        </button>

        <button
          aria-label="Egg"
          className="toolbar-icon-btn"
          type="button"
        >
          <svg
            aria-hidden="true"
            className="toolbar-icon-svg"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path d="M12 3C8 3 5 8.5 5 14a7 7 0 0 0 14 0C19 8.5 16 3 12 3Z" />
          </svg>
        </button>
      </div>

      <a className="toolbar-more-link" href="#more">
        <span className="toolbar-more-text">More</span>
        <svg
          aria-hidden="true"
          className="toolbar-more-arrow"
          fill="currentColor"
          viewBox="0 0 12 12"
        >
          <path d="M2 1l8 5-8 5V1z" />
        </svg>
      </a>
    </nav>
  );
}
