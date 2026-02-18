type SurveillanceIconKind = "footprint" | "fossil" | "dna" | "egg";

interface SurveillanceIconButtonDefinition {
  iconKind: SurveillanceIconKind;
  label: string;
}

const SURVEILLANCE_ICON_BUTTONS: readonly SurveillanceIconButtonDefinition[] = [
  { iconKind: "footprint", label: "Track Prints" },
  { iconKind: "fossil", label: "Fossil Scan" },
  { iconKind: "dna", label: "DNA Trace" },
  { iconKind: "egg", label: "Egg Monitor" },
];

function SurveillanceIcon({ kind }: { kind: SurveillanceIconKind }) {
  if (kind === "footprint") {
    return (
      <svg aria-hidden="true" className="surveillance-toolbar-icon-svg" viewBox="0 0 24 24">
        <ellipse cx="12.3" cy="15.5" rx="3.2" ry="4.3" />
        <circle cx="8.3" cy="8.7" r="1.1" />
        <circle cx="10.3" cy="7.2" r="1.15" />
        <circle cx="12.8" cy="6.4" r="1.1" />
        <circle cx="15.1" cy="7.1" r="1.05" />
      </svg>
    );
  }

  if (kind === "fossil") {
    return (
      <svg aria-hidden="true" className="surveillance-toolbar-icon-svg" viewBox="0 0 24 24">
        <path d="M12 5.2a6.8 6.8 0 1 0 6.8 6.8 5.1 5.1 0 0 0-5.1-5.1 3.8 3.8 0 0 0-3.8 3.8 2.6 2.6 0 0 0 2.6 2.6 1.8 1.8 0 0 0 1.8-1.8" />
      </svg>
    );
  }

  if (kind === "dna") {
    return (
      <svg aria-hidden="true" className="surveillance-toolbar-icon-svg" viewBox="0 0 24 24">
        <path d="M7 5.2c5.3 0 4.7 13.6 10 13.6" />
        <path d="M17 5.2c-5.3 0-4.7 13.6-10 13.6" />
        <path d="M9 8.3h6" />
        <path d="M9 12h6" />
        <path d="M9 15.7h6" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="surveillance-toolbar-icon-svg" viewBox="0 0 24 24">
      <path d="M12 3.4c-3.7 0-6.1 3-6.1 7.8 0 5.5 3.6 8.9 6.1 9.4 2.5-.5 6.1-3.9 6.1-9.4 0-4.8-2.4-7.8-6.1-7.8Z" />
      <path d="m9 12 1.7-1.8 1.4 1.6 2-2.2 1 1.1-2 2.1 1.8 1.9-1.2 1.2-1.8-1.9-1.8 2-1.1-1.1 1.9-2.2Z" />
    </svg>
  );
}

function SurveillanceIconButton({ definition }: { definition: SurveillanceIconButtonDefinition }) {
  return (
    <button
      aria-label={definition.label}
      className="surveillance-toolbar-icon-button"
      data-icon-kind={definition.iconKind}
      type="button"
    >
      <SurveillanceIcon kind={definition.iconKind} />
      <span className="surveillance-toolbar-icon-text">{definition.label}</span>
    </button>
  );
}

export function IslaSornaSurveillanceToolbar() {
  return (
    <footer
      aria-label="Isla Sorna surveillance toolbar"
      className="surveillance-toolbar-shell"
      id="surveillance-toolbar-more"
    >
      <div className="surveillance-toolbar" data-ui-surface="surveillance-toolbar">
        <div aria-label="Surveillance equipment controls" className="surveillance-toolbar-icons" role="group">
          {SURVEILLANCE_ICON_BUTTONS.map((definition) => (
            <SurveillanceIconButton definition={definition} key={definition.iconKind} />
          ))}
        </div>

        <p className="surveillance-toolbar-label">ISLA SORNA SURVEILLANCE DEVICE</p>

        <a className="surveillance-toolbar-more" href="#surveillance-toolbar-more">
          MORE
          <span aria-hidden="true" className="surveillance-toolbar-more-arrow" />
        </a>
      </div>
    </footer>
  );
}
