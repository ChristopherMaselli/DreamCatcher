import type { ReactNode } from "react";

interface AppShellProps {
  actions: ReactNode;
  children: ReactNode;
}

export function AppShell({ actions, children }: AppShellProps) {
  return (
    <div className="app-shell">
      <div className="app-shell__backdrop" />
      <main className="app-shell__content">
        <header className="hero">
          <div>
            <p className="eyebrow">DreamCatcher</p>
            <h1>Late-night REM patterns for manual WILD wake timing.</h1>
            <p className="hero__lede">
              Review the last 7 nights, isolate the final REM segments before wake,
              and keep a clean personal dashboard ready for the next lucid dreaming attempt.
            </p>
          </div>
          <div className="hero__actions">{actions}</div>
        </header>
        {children}
      </main>
    </div>
  );
}
