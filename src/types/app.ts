import type { CachedSleepPayload } from "./oura";

export type SourceMode = "live" | "mock";
export type ResolvedSource = "live" | "mock";
export type SleepStage = "awake" | "light" | "deep" | "rem" | "unknown";

export interface BackendEnvStatus {
  liveConfigured: boolean;
  missing: string[];
  redirectUri?: string | null;
  scopes: string[];
}

export interface BackendAuthStatus {
  connected: boolean;
  hasRefreshToken: boolean;
  expiresAt?: string | null;
}

export interface BackendSnapshot {
  env: BackendEnvStatus;
  auth: BackendAuthStatus;
  cache?: CachedSleepPayload | null;
}

export interface TimelineSegment {
  stage: SleepStage;
  startTime: string;
  endTime: string;
  startOffsetMinutes: number;
  endOffsetMinutes: number;
  durationMinutes: number;
  label: string;
}

export interface NormalizedSleepDay {
  id: string;
  source: ResolvedSource;
  dateKey: string;
  dateLabel: string;
  status: "ready" | "partial" | "missing";
  bedtime?: string | null;
  finalWakeTime?: string | null;
  totalSleepSeconds?: number | null;
  totalSpanMinutes?: number;
  timeline: TimelineSegment[];
  remSegments: TimelineSegment[];
  highlightedRemSegments: TimelineSegment[];
  note?: string;
}

export interface WildSuggestion {
  status: "ready" | "partial" | "unavailable";
  basisNights: number;
  windowStartOffsetMinutes?: number;
  windowEndOffsetMinutes?: number;
  windowStartClock?: string;
  windowEndClock?: string;
  averageBedtimeClock?: string;
  cutoffMinutes?: number;
  ignoredBySelection: number;
  ignoredByLateBedtime: number;
  usedDayIds: string[];
  explanation: string;
}

export interface WildSuggestionOptions {
  includedDayIds?: string[];
  bedtimeCutoffMinutes?: number;
}

export interface DashboardPayload {
  snapshot: BackendSnapshot;
  source: ResolvedSource;
  fetchedAt: string;
  days: NormalizedSleepDay[];
  suggestion: WildSuggestion;
  warnings: string[];
}
