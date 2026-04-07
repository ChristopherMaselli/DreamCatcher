import type { BackendSnapshot, OuraAuthLaunch } from "../types/app";

interface OuraConnectionStatusProps {
  snapshot: BackendSnapshot;
  busyState: "loading" | "refreshing" | "starting-connect" | "finishing-connect" | "disconnecting" | null;
  authLaunch: OuraAuthLaunch | null;
  callbackUrl: string;
  onConnect: () => void;
  onCallbackUrlChange: (value: string) => void;
  onCompleteConnect: () => void;
  onDisconnect: () => void;
}

export function OuraConnectionStatus({
  snapshot,
  busyState,
  authLaunch,
  callbackUrl,
  onConnect,
  onCallbackUrlChange,
  onCompleteConnect,
  onDisconnect,
}: OuraConnectionStatusProps) {
  const isConfigured = snapshot.env.liveConfigured;
  const isConnected = snapshot.auth.connected;
  const isBusy = busyState !== null;
  const canFinish = Boolean(authLaunch && callbackUrl.trim()) && !isBusy;

  return (
    <section className="panel panel--status">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Oura Connection</p>
          <h2>{isConnected ? "Connected" : "Disconnected"}</h2>
        </div>
        <span className={`status-pill ${isConnected ? "status-pill--live" : "status-pill--idle"}`}>
          {isConnected ? "Live tokens ready" : "No live session"}
        </span>
      </div>

      <div className="status-grid">
        <div className="metric-chip">
          <span className="metric-chip__label">OAuth</span>
          <strong>{isConfigured ? "Configured" : "Missing env vars"}</strong>
        </div>
        <div className="metric-chip">
          <span className="metric-chip__label">Refresh token</span>
          <strong>{snapshot.auth.hasRefreshToken ? "Available" : "Not stored yet"}</strong>
        </div>
        <div className="metric-chip">
          <span className="metric-chip__label">Redirect URI</span>
          <strong>{snapshot.env.redirectUri ?? "Not configured"}</strong>
        </div>
      </div>

      {!isConfigured ? (
        <p className="panel__note">
          Add your Oura credentials to `.env` to enable live data. Until then, the week stays empty unless you explicitly switch to the mock week.
        </p>
      ) : isConnected ? (
        <p className="panel__note">
          Live Oura access is active. Press Refresh Data whenever you want to pull the latest week.
        </p>
      ) : (
        <div className="auth-flow">
          <p className="panel__note">
            DreamCatcher now expects a hosted HTTPS callback page. Start the sign-in here, let Oura redirect to your GitHub Pages callback, then paste the full final browser URL back into the app.
          </p>

          <div className="auth-callout">
            <strong>Expected callback page</strong>
            <span>{authLaunch?.redirectUri ?? snapshot.env.redirectUri ?? "Not configured"}</span>
          </div>

          <label className="stack-field" htmlFor="oura-callback-url">
            <span>Paste the full callback URL from the browser address bar</span>
            <textarea
              id="oura-callback-url"
              className="text-input text-input--multiline"
              value={callbackUrl}
              onChange={(event) => onCallbackUrlChange(event.target.value)}
              placeholder="https://yourusername.github.io/DreamCatcher/oura-callback.html?code=...&state=..."
              disabled={isBusy}
            />
          </label>

          <div className="auth-callout auth-callout--muted">
            <strong>Flow</strong>
            <span>1. Start Oura sign-in. 2. Approve in the browser. 3. Copy the full callback URL from the hosted page. 4. Paste it here and finish.</span>
          </div>
        </div>
      )}

      <div className="button-row">
        <button className="button button--primary" disabled={!isConfigured || isBusy} onClick={onConnect}>
          {busyState === "starting-connect"
            ? "Opening Oura..."
            : authLaunch && !isConnected
              ? "Open Oura Again"
              : isConnected
                ? "Reconnect Oura"
                : "Start Oura Sign-in"}
        </button>
        {!isConnected ? (
          <button className="button button--ghost" disabled={!canFinish} onClick={onCompleteConnect}>
            {busyState === "finishing-connect" ? "Finishing..." : "Finish Connection"}
          </button>
        ) : null}
        <button className="button button--ghost" disabled={!isConnected || isBusy} onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    </section>
  );
}
