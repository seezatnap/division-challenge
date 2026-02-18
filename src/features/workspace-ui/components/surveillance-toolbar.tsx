interface ToolbarIconProps {
  className?: string;
}

function FootprintIcon({ className }: ToolbarIconProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 24 24">
      <ellipse cx="12" cy="15.4" rx="4.3" ry="5.7" fill="currentColor" opacity="0.78" />
      <circle cx="7.6" cy="8.4" r="1.1" fill="currentColor" />
      <circle cx="9.8" cy="6.4" r="1.05" fill="currentColor" />
      <circle cx="12.6" cy="5.8" r="1" fill="currentColor" />
      <circle cx="15.2" cy="6.6" r="1.1" fill="currentColor" />
    </svg>
  );
}

function FossilIcon({ className }: ToolbarIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.55"
      viewBox="0 0 24 24"
    >
      <path d="M12 4.9a7.1 7.1 0 1 0 0 14.2 5.6 5.6 0 1 0 0-11.2 3.35 3.35 0 1 0 0 6.7 1.7 1.7 0 1 0 0-3.4" />
      <circle cx="12.2" cy="12.95" fill="currentColor" r="0.7" stroke="none" />
    </svg>
  );
}

function DnaHelixIcon({ className }: ToolbarIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.55"
      viewBox="0 0 24 24"
    >
      <path d="M8.2 4c5 3.2 5 12.8 0 16" />
      <path d="M15.8 4c-5 3.2-5 12.8 0 16" />
      <path d="M8.9 7h6.2" />
      <path d="M8.5 11h7" />
      <path d="M8.5 15h7" />
      <path d="M8.9 19h6.2" />
    </svg>
  );
}

function EggIcon({ className }: ToolbarIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.55"
      viewBox="0 0 24 24"
    >
      <path d="M12 3.8c3.8 0 6.4 4.4 6.4 9.2 0 4.3-2.8 7.2-6.4 7.2S5.6 17.3 5.6 13c0-4.8 2.6-9.2 6.4-9.2Z" />
      <path d="m9.2 13 1.6 1.35 1.35-1.35 1.65 1.55 1.2-1.2" />
    </svg>
  );
}

const toolbarEquipment = [
  {
    id: "footprint",
    label: "Footprint tracker",
    Icon: FootprintIcon,
  },
  {
    id: "fossil",
    label: "Fossil scanner",
    Icon: FossilIcon,
  },
  {
    id: "dna",
    label: "DNA analyzer",
    Icon: DnaHelixIcon,
  },
  {
    id: "egg",
    label: "Egg monitor",
    Icon: EggIcon,
  },
] as const;

export function SurveillanceToolbar() {
  return (
    <footer
      aria-label="Isla Sorna surveillance toolbar"
      className="jp-surveillance-toolbar"
      data-ui-surface="surveillance-toolbar"
      id="surveillance-device-toolbar"
    >
      <div
        aria-label="Surveillance equipment controls"
        className="jp-surveillance-toolbar-icons"
        role="toolbar"
      >
        {toolbarEquipment.map(({ id, label, Icon }) => (
          <button aria-label={label} className="jp-surveillance-icon-button" key={id} type="button">
            <Icon className="jp-surveillance-icon" />
          </button>
        ))}
      </div>

      <p className="jp-surveillance-toolbar-label">ISLA SORNA SURVEILLANCE DEVICE</p>

      <a className="jp-surveillance-toolbar-more" data-ui-action="toolbar-more" href="#surveillance-device-toolbar">
        MORE
      </a>
    </footer>
  );
}
