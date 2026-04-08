import { buildMockSleepSessions } from "../mocks/mockSleepData";
import type { DashboardPayload, OuraAuthLaunch, ResolvedSource, SourceMode } from "../types/app";
import { normalizeSleepSessions } from "./sleepNormalizer";
import { buildWildSuggestion } from "./suggestionHeuristic";
import {
  connectOura,
  disconnectOura,
  finishOuraConnect,
  getBackendSnapshot,
  refreshLiveData,
} from "./tauriBridge";

const DEFAULT_BEDTIME_CUTOFF_MINUTES = 150;

export async function loadDashboard(mode: SourceMode): Promise<DashboardPayload> {
  const snapshot = await getBackendSnapshot();
  return hydrateDashboard(snapshot, mode, false);
}

export async function refreshDashboard(mode: SourceMode): Promise<DashboardPayload> {
  const snapshot = await getBackendSnapshot();
  return hydrateDashboard(snapshot, mode, true);
}

export async function beginSignIn(): Promise<OuraAuthLaunch> {
  return connectOura();
}

export async function finishSignInAndReload(mode: SourceMode, callbackUrl: string): Promise<DashboardPayload> {
  const snapshot = await finishOuraConnect(callbackUrl);

  if (!snapshot.auth.connected) {
    throw new Error(
      "DreamCatcher finished the Oura callback step but still did not receive stored tokens. The auth flow did not complete successfully.",
    );
  }

  return hydrateDashboard(snapshot, mode, true);
}

export async function disconnectAndReload(mode: SourceMode): Promise<DashboardPayload> {
  const snapshot = await disconnectOura();
  return hydrateDashboard(snapshot, mode, false);
}

async function hydrateDashboard(
  snapshot: Awaited<ReturnType<typeof getBackendSnapshot>>,
  mode: SourceMode,
  forceRefresh: boolean,
): Promise<DashboardPayload> {
  let nextSnapshot = snapshot;
  const source: ResolvedSource = mode;
  const warnings: string[] = [];

  if (source === "live") {
    const canUseLive = nextSnapshot.env.liveConfigured && nextSnapshot.auth.connected;

    if (canUseLive && (forceRefresh || !nextSnapshot.cache?.sessions.length)) {
      try {
        nextSnapshot = await refreshLiveData();
      } catch (error) {
        warnings.push(
          asMessage(
            error,
            "Live refresh failed. DreamCatcher will keep any cached live sleep data and leave the remaining days empty.",
          ),
        );
      }
    } else if (!canUseLive) {
      warnings.push(describeLiveModeStatus(nextSnapshot));
    }
  }

  const sessions = source === "mock" ? buildMockSleepSessions() : nextSnapshot.cache?.sessions ?? [];
  const days = normalizeSleepSessions(sessions, source);
  const suggestion = buildWildSuggestion(days, {
    includedDayIds: days.map((day) => day.id),
    bedtimeCutoffMinutes: DEFAULT_BEDTIME_CUTOFF_MINUTES,
  });

  return {
    snapshot: nextSnapshot,
    source,
    fetchedAt:
      source === "live"
        ? nextSnapshot.cache?.fetchedAt ?? new Date().toISOString()
        : new Date().toISOString(),
    days,
    suggestion,
    warnings,
  };
}

function describeLiveModeStatus(snapshot: Awaited<ReturnType<typeof getBackendSnapshot>>): string {
  if (!snapshot.env.liveConfigured) {
    return `Live mode needs ${snapshot.env.missing.join(", ")} in your .env file. Until then, DreamCatcher keeps the week empty unless you explicitly press Use Mock Week.`;
  }

  if (!snapshot.auth.connected) {
    return "Live mode is active, but Oura is not connected yet. Start the hosted Oura sign-in, let the browser land on your callback page, then paste the full callback URL back into DreamCatcher.";
  }

  return "No live Oura sleep data is cached yet. Press Refresh Data after connecting, or switch to Use Mock Week.";
}

function asMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
