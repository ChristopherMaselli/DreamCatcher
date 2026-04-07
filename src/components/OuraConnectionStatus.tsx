import type { BackendSnapshot } from "../types/app";

interface OuraConnectionStatusProps {
  snapshot: BackendSnapshot;
  busy: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function OuraConnectionStatus({
  snapshot,
  busy,
  onConnect,
  onDisconnect,
}: OuraConnectionStatusProps) {
  const isConfigured = snapshot.env.liveConfigured;
  const isConnected = snapshot.auth.connected;

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
          Add your Oura credentials to `.env` to enable live data. Until then,
          the week stays empty unless you explicitly switch to the mock week.
        </p>
      ) : !isConnected ? (
        <p className="panel__note">
          Live mode is ready, but Oura is not connected yet. Connect when you want
          DreamCatcher to fill the week with real sleep data.
        </p>
      ) : (
        <p className="panel__note">
          Live Oura access is active. Press Refresh Data whenever you want to pull the latest week.
        </p>
      )}

      <div className="button-row">
        <button
          className="button button--primary"
          disabled={!isConfigured || busy}
          onClick={onConnect}
        >
          {busy ? "Connecting..." : isConnected ? "Reconnect Oura" : "Connect Oura"}
        </button>
        <button
          className="button button--ghost"
          disabled={!isConnected || busy}
          onClick={onDisconnect}
        >
          Disconnect
        </button>
      </div>
    </section>
  );
}
