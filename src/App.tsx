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
const DEFAULT_BEDTIME_CUTOFF_MINUTES = 150;

type DashboardTab = "tonight" | "history";
type BusyState = "loading" | "refreshing" | "starting-connect" | "finishing-connect" | "disconnecting" | null;

export default function App() {
  const [mode, setMode] = useState<SourceMode>(readStoredMode());
  const [activeTab, setActiveTab] = useState<DashboardTab>("history");
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
      if (current && payload.days.some((day) => day.id === current)) {
        return current;
      }

      return payload.days.find((day) => day.status !== "missing")?.id ?? payload.days[0]?.id ?? null;
    });

    setIncludedDayMap((current) => {
      const next: Record<string, boolean> = {};
      for (const day of payload.days) {
        next[day.id] = current[day.id] ?? true;
      }
      return next;
    });
  }, [payload]);

  const days = payload?.days ?? [];
  const includedDayIds = useMemo(
    () => days.filter((day) => includedDayMap[day.id] !== false).map((day) => day.id),
    [days, includedDayMap],
  );
  const selectedDay =
    days.find((day) => day.id === selectedDayId) ??
    days.find((day) => day.status !== "missing") ??
    days[0] ??
    null;
  const suggestion = useMemo(
    () =>
      buildWildSuggestion(days, {
        includedDayIds,
        bedtimeCutoffMinutes,
      }),
    [days, includedDayIds, bedtimeCutoffMinutes],
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
      <section className="dashboard-top">
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
        <section className="dashboard-main dashboard-main--history">
          <DashboardCalendar
            days={days}
            selectedDayId={selectedDay?.id ?? null}
            includedDayIds={includedDayIds}
            onSelectDay={setSelectedDayId}
            onIncludedChange={handleIncludedChange}
          />
          <div className="dashboard-stack">
            <SourceModeToggle mode={mode} busy={isBusy} onModeChange={handleModeChange} />
            <section className="panel">
              <div className="panel__header">
                <div>
                  <p className="panel__eyebrow">History Notes</p>
                  <h2>How this view works</h2>
                </div>
              </div>
              <p className="panel__note">
                Click any day to pin its sleep timestream above. The checkbox on each card decides whether that night contributes to tonight&apos;s WILD estimate.
              </p>
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
          </div>
        </section>
      ) : (
        <section className="dashboard-main">
          <WildSuggestionPanel
            suggestion={suggestion}
            source={payload?.source ?? mode}
            fetchedAt={payload?.fetchedAt ?? new Date().toISOString()}
            bedtimeCutoffMinutes={bedtimeCutoffMinutes}
            onCutoffChange={handleCutoffChange}
          />
          <div className="dashboard-stack">
            <SourceModeToggle mode={mode} busy={isBusy} onModeChange={handleModeChange} />
            <section className="panel">
              <div className="panel__header">
                <div>
                  <p className="panel__eyebrow">Algorithm Notes</p>
                  <h2>What counts tonight</h2>
                </div>
              </div>
              <p className="panel__note">
                DreamCatcher groups contiguous REM epochs from Oura&apos;s 5-minute sleep-stage timeline, highlights the final two blocks before wake, and averages the checked nights that survive your bedtime cutoff.
              </p>
              <div className="alert-list">
                <p className="alert alert--warning">
                  Nights used right now: {suggestion.basisNights}. Unchecked nights: {suggestion.ignoredBySelection}. Past cutoff: {suggestion.ignoredByLateBedtime}.
                </p>
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
          </div>
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

function asMessage(reason: unknown): string {
  if (reason instanceof Error && reason.message) {
    return reason.message;
  }

  return "Something went wrong while loading DreamCatcher.";
}
