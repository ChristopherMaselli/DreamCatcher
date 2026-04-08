import { startTransition, useEffect, useMemo, useState } from "react";
import { AppShell } from "./components/AppShell";
import { DashboardCalendar } from "./components/DashboardCalendar";
import { OuraConnectionStatus } from "./components/OuraConnectionStatus";
import { SelectedSleepPanel } from "./components/SelectedSleepPanel";
import { SourceModeToggle } from "./components/SourceModeToggle";
import { WildSuggestionPanel } from "./components/WildSuggestionPanel";
import {
  beginSignIn,
  disconnectAndReload,
  finishSignInAndReload,
  loadDashboard,
  refreshDashboard,
} from "./services/dataSource";
import {
  buildWildSuggestion,
  canUseDayForSuggestion,
} from "./services/suggestionHeuristic";
import type { DashboardPayload, OuraAuthLaunch, SourceMode } from "./types/app";

const SOURCE_MODE_STORAGE_KEY = "dreamcatcher-source-mode";
const BEDTIME_CUTOFF_STORAGE_KEY = "dreamcatcher-bedtime-cutoff";
const SHOW_MISSING_DAYS_STORAGE_KEY = "dreamcatcher-show-missing-days";
const DEFAULT_BEDTIME_CUTOFF_MINUTES = 150;

type DashboardTab = "tonight" | "history";
type BusyState = "loading" | "refreshing" | "starting-connect" | "finishing-connect" | "disconnecting" | null;

export default function App() {
  const [mode, setMode] = useState<SourceMode>(readStoredMode());
  const [activeTab, setActiveTab] = useState<DashboardTab>("tonight");
  const [showMissingDays, setShowMissingDays] = useState<boolean>(readStoredShowMissingDays());
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [includedDayMap, setIncludedDayMap] = useState<Record<string, boolean>>({});
  const [bedtimeCutoffMinutes, setBedtimeCutoffMinutes] = useState<number>(readStoredCutoff());
  const [busyState, setBusyState] = useState<BusyState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLaunch, setAuthLaunch] = useState<OuraAuthLaunch | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("");

  useEffect(() => {
    let active = true;
    setBusyState("loading");
    setError(null);
    setAuthError(null);

    loadDashboard(mode)
      .then((nextPayload) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          setPayload(nextPayload);
          if (nextPayload.snapshot.auth.connected) {
            setAuthLaunch(null);
            setCallbackUrl("");
          }
          setBusyState(null);
        });
      })
      .catch((reason) => {
        if (!active) {
          return;
        }

        setError(asMessage(reason));
        setBusyState(null);
      });

    return () => {
      active = false;
    };
  }, [mode]);

  useEffect(() => {
    if (!payload) {
      return;
    }

    setSelectedDayId((current) => {
      if (current && payload.days.some((day) => day.id === current && (showMissingDays || day.status !== "missing"))) {
        return current;
      }

      if (showMissingDays) {
        return payload.days[0]?.id ?? null;
      }

      return payload.days.find((day) => day.status !== "missing")?.id ?? null;
    });

    setIncludedDayMap((current) => {
      const next: Record<string, boolean> = {};
      for (const day of payload.days) {
        next[day.id] = current[day.id] ?? true;
      }
      return next;
    });
  }, [payload, showMissingDays]);

  const days = payload?.days ?? [];
  const visibleDays = useMemo(
    () => (showMissingDays ? days : days.filter((day) => day.status !== "missing")),
    [days, showMissingDays],
  );
  const suggestionDays = useMemo(() => days.filter((day) => day.status !== "missing"), [days]);
  const includedDayIds = useMemo(
    () => suggestionDays.filter((day) => includedDayMap[day.id] !== false).map((day) => day.id),
    [suggestionDays, includedDayMap],
  );
  const selectedDay =
    visibleDays.find((day) => day.id === selectedDayId) ??
    visibleDays[0] ??
    null;
  const suggestion = useMemo(
    () =>
      buildWildSuggestion(suggestionDays, {
        includedDayIds,
        bedtimeCutoffMinutes,
      }),
    [suggestionDays, includedDayIds, bedtimeCutoffMinutes],
  );
  const selectedCanInclude = selectedDay ? canUseDayForSuggestion(selectedDay) : false;
  const selectedIncluded = selectedDay ? includedDayMap[selectedDay.id] !== false : false;
  const isBusy = busyState !== null;

  function handleModeChange(nextMode: SourceMode) {
    localStorage.setItem(SOURCE_MODE_STORAGE_KEY, nextMode);
    setMode(nextMode);
  }

  function handleIncludedChange(dayId: string, included: boolean) {
    setIncludedDayMap((current) => ({
      ...current,
      [dayId]: included,
    }));
  }

  function handleCutoffChange(minutes: number) {
    localStorage.setItem(BEDTIME_CUTOFF_STORAGE_KEY, String(minutes));
    setBedtimeCutoffMinutes(minutes);
  }

  function handleShowMissingDaysChange(checked: boolean) {
    localStorage.setItem(SHOW_MISSING_DAYS_STORAGE_KEY, checked ? "true" : "false");
    setShowMissingDays(checked);
  }

  async function handleRefresh() {
    setBusyState("refreshing");
    setError(null);

    try {
      const nextPayload = await refreshDashboard(mode);
      startTransition(() => {
        setPayload(nextPayload);
        setBusyState(null);
      });
    } catch (reason) {
      setError(asMessage(reason));
      setBusyState(null);
    }
  }

  async function handleConnect() {
    setBusyState("starting-connect");
    setError(null);
    setAuthError(null);

    try {
      const launch = await beginSignIn();
      startTransition(() => {
        setAuthLaunch(launch);
        setBusyState(null);
      });
    } catch (reason) {
      setAuthError(asMessage(reason));
      setBusyState(null);
    }
  }

  async function handleFinishConnect() {
    setBusyState("finishing-connect");
    setError(null);
    setAuthError(null);

    try {
      const nextPayload = await finishSignInAndReload(mode, callbackUrl);
      startTransition(() => {
        setPayload(nextPayload);
        setAuthLaunch(null);
        setCallbackUrl("");
        setBusyState(null);
      });
    } catch (reason) {
      setAuthError(asMessage(reason));
      setBusyState(null);
    }
  }

  async function handleDisconnect() {
    setBusyState("disconnecting");
    setError(null);
    setAuthError(null);

    try {
      const nextPayload = await disconnectAndReload(mode);
      startTransition(() => {
        setPayload(nextPayload);
        setAuthLaunch(null);
        setCallbackUrl("");
        setBusyState(null);
      });
    } catch (reason) {
      setError(asMessage(reason));
      setBusyState(null);
    }
  }

  return (
    <AppShell
      actions={
        <button className="button button--primary" disabled={isBusy} onClick={handleRefresh}>
          {busyState === "refreshing" ? "Refreshing..." : "Refresh Data"}
        </button>
      }
    >
      <div className="tab-row" role="tablist" aria-label="DreamCatcher views">
        <button
          className={`tab-button ${activeTab === "history" ? "tab-button--active" : ""}`}
          onClick={() => setActiveTab("history")}
        >
          History
        </button>
        <button
          className={`tab-button ${activeTab === "tonight" ? "tab-button--active" : ""}`}
          onClick={() => setActiveTab("tonight")}
        >
          Tonight
        </button>
      </div>

      {activeTab === "history" ? (
        <section className="dashboard-flow">
          <SelectedSleepPanel
            day={selectedDay}
            includedInSuggestion={selectedIncluded}
            canInclude={selectedCanInclude}
            onIncludedChange={(included) => {
              if (selectedDay) {
                handleIncludedChange(selectedDay.id, included);
              }
            }}
          />

          <section className="panel panel--section">
            <div className="panel__header panel__header--stacked">
              <div>
                <p className="panel__eyebrow">Visible Nights</p>
                <h2>Your real sleep days this week</h2>
              </div>
              <div className="panel__header-actions">
                <p className="panel__note">
                  {showMissingDays
                    ? "Showing the full 7-day week, including empty dates."
                    : "Empty dates are hidden. Only nights that actually returned sleep data appear here."}
                </p>
                <label className={`toggle-chip ${showMissingDays ? "toggle-chip--checked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={showMissingDays}
                    onChange={(event) => handleShowMissingDaysChange(event.target.checked)}
                  />
                  <span>Show empty dates</span>
                </label>
              </div>
            </div>
            <DashboardCalendar
              days={days}
              selectedDayId={selectedDay?.id ?? null}
              includedDayIds={includedDayIds}
              showMissingDays={showMissingDays}
              onSelectDay={setSelectedDayId}
              onIncludedChange={handleIncludedChange}
            />
          </section>

          <section className="dashboard-bottom">
            <SourceModeToggle mode={mode} busy={isBusy} onModeChange={handleModeChange} />
            <OuraConnectionStatus
              snapshot={payload?.snapshot ?? emptySnapshot}
              busyState={busyState}
              authLaunch={authLaunch}
              callbackUrl={callbackUrl}
              authError={authError}
              onConnect={handleConnect}
              onCallbackUrlChange={setCallbackUrl}
              onCompleteConnect={handleFinishConnect}
              onDisconnect={handleDisconnect}
            />
          </section>

          {payload?.warnings.length || error ? (
            <section className="panel panel--section">
              <div className="panel__header panel__header--stacked">
                <div>
                  <p className="panel__eyebrow">Notes</p>
                  <h2>Status and warnings</h2>
                </div>
              </div>
              {payload?.warnings.length ? (
                <div className="alert-list">
                  {payload.warnings.map((warning) => (
                    <p key={warning} className="alert alert--warning">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}
              {error ? <p className="alert alert--error">{error}</p> : null}
            </section>
          ) : null}
        </section>
      ) : (
        <section className="dashboard-flow">
          <WildSuggestionPanel
            suggestion={suggestion}
            source={payload?.source ?? mode}
            fetchedAt={payload?.fetchedAt ?? new Date().toISOString()}
            bedtimeCutoffMinutes={bedtimeCutoffMinutes}
            onCutoffChange={handleCutoffChange}
          />

          <section className="panel panel--section">
            <div className="panel__header panel__header--stacked">
              <div>
                <p className="panel__eyebrow">Eligible Nights</p>
                <h2>The nights feeding tonight&apos;s estimate</h2>
              </div>
              <div className="panel__header-actions">
                <p className="panel__note">
                  Nights used right now: {suggestion.basisNights}. Unchecked nights: {suggestion.ignoredBySelection}. Past cutoff: {suggestion.ignoredByLateBedtime}.
                </p>
                <label className={`toggle-chip ${showMissingDays ? "toggle-chip--checked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={showMissingDays}
                    onChange={(event) => handleShowMissingDaysChange(event.target.checked)}
                  />
                  <span>Show empty dates</span>
                </label>
              </div>
            </div>
            <DashboardCalendar
              days={days}
              selectedDayId={selectedDay?.id ?? null}
              includedDayIds={includedDayIds}
              showMissingDays={showMissingDays}
              onSelectDay={setSelectedDayId}
              onIncludedChange={handleIncludedChange}
            />
          </section>

          <section className="dashboard-bottom">
            <SourceModeToggle mode={mode} busy={isBusy} onModeChange={handleModeChange} />
            <OuraConnectionStatus
              snapshot={payload?.snapshot ?? emptySnapshot}
              busyState={busyState}
              authLaunch={authLaunch}
              callbackUrl={callbackUrl}
              authError={authError}
              onConnect={handleConnect}
              onCallbackUrlChange={setCallbackUrl}
              onCompleteConnect={handleFinishConnect}
              onDisconnect={handleDisconnect}
            />
          </section>

          {payload?.warnings.length || error ? (
            <section className="panel panel--section">
              <div className="panel__header panel__header--stacked">
                <div>
                  <p className="panel__eyebrow">Notes</p>
                  <h2>Status and warnings</h2>
                </div>
              </div>
              {payload?.warnings.length ? (
                <div className="alert-list">
                  {payload.warnings.map((warning) => (
                    <p key={warning} className="alert alert--warning">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}
              {error ? <p className="alert alert--error">{error}</p> : null}
            </section>
          ) : null}
        </section>
      )}
    </AppShell>
  );
}

const emptySnapshot = {
  env: {
    liveConfigured: false,
    missing: ["OURA_CLIENT_ID", "OURA_CLIENT_SECRET", "OURA_REDIRECT_URI"],
    redirectUri: null,
    scopes: ["daily"],
  },
  auth: {
    connected: false,
    hasRefreshToken: false,
    expiresAt: null,
  },
  cache: null,
};

function readStoredMode(): SourceMode {
  if (typeof localStorage === "undefined") {
    return "live";
  }

  const stored = localStorage.getItem(SOURCE_MODE_STORAGE_KEY);
  if (stored === "live" || stored === "mock") {
    return stored;
  }

  return "live";
}

function readStoredCutoff(): number {
  if (typeof localStorage === "undefined") {
    return DEFAULT_BEDTIME_CUTOFF_MINUTES;
  }

  const stored = Number(localStorage.getItem(BEDTIME_CUTOFF_STORAGE_KEY));
  return Number.isFinite(stored) && stored >= 60 && stored <= 300
    ? stored
    : DEFAULT_BEDTIME_CUTOFF_MINUTES;
}

function readStoredShowMissingDays(): boolean {
  if (typeof localStorage === "undefined") {
    return false;
  }

  return localStorage.getItem(SHOW_MISSING_DAYS_STORAGE_KEY) === "true";
}

function asMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }

  return "Something went wrong while loading DreamCatcher.";
}
