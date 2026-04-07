import type { SourceMode } from "../types/app";

interface SourceModeToggleProps {
  mode: SourceMode;
  busy: boolean;
  onModeChange: (mode: SourceMode) => void;
}

const modes: Array<{ id: SourceMode; label: string; description: string }> = [
  {
    id: "live",
    label: "Live Oura",
    description:
      "Default. If no real sleep data is available yet, the week stays empty until you connect or refresh.",
  },
  {
    id: "mock",
    label: "Use Mock Week",
    description:
      "Load the built-in demo data only when you explicitly want to preview the dashboard.",
  },
];

export function SourceModeToggle({
  mode,
  busy,
  onModeChange,
}: SourceModeToggleProps) {
  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Data Source</p>
          <h2>Choose what fills the week</h2>
        </div>
      </div>
      <div className="mode-toggle">
        {modes.map((entry) => (
          <button
            key={entry.id}
            className={`mode-toggle__button ${mode === entry.id ? "mode-toggle__button--active" : ""}`}
            disabled={busy}
            onClick={() => onModeChange(entry.id)}
          >
            <span>{entry.label}</span>
            <small>{entry.description}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
