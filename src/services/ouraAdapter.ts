import type { SleepStage } from "../types/app";
import type { OuraSleepSession } from "../types/oura";

const stageCodeMap: Record<string, SleepStage> = {
  "0": "unknown",
  "1": "deep",
  "2": "light",
  "3": "rem",
  "4": "awake",
  D: "deep",
  L: "light",
  R: "rem",
  W: "awake",
};

export function parseStageEpochs(session: OuraSleepSession): SleepStage[] {
  const rawTimeline = session.sleep_phase_5_min ?? session.hypnogram_5min;
  if (!rawTimeline) {
    return [];
  }

  // Oura's public auth docs do not describe named REM "cycles", so we treat
  // the 5-minute hypnogram string as the closest available sleep-stage signal.
  // This assumes the historical Oura mapping 1=Deep, 2=Light, 3=REM, 4=Awake.
  const compact = rawTimeline.replace(/\s+/g, "").trim();

  if (!compact) {
    return [];
  }

  const tokens = compact.includes(",") ? compact.split(",") : compact.split("");

  return tokens.map((token) => stageCodeMap[token.toUpperCase()] ?? "unknown");
}

export function chooseMainOvernightSession(
  sessions: OuraSleepSession[],
): OuraSleepSession | null {
  if (!sessions.length) {
    return null;
  }

  return [...sessions].sort((left, right) => scoreSession(right) - scoreSession(left))[0];
}

function scoreSession(session: OuraSleepSession): number {
  const totalSleep = session.total_sleep_duration ?? session.duration ?? 0;
  const type = (session.type ?? "").toLowerCase();
  const bedtime = session.bedtime_start ? new Date(session.bedtime_start) : null;
  const hour = bedtime?.getHours() ?? 0;
  const overnightBonus = hour >= 18 || hour <= 3 ? 7200 : 0;
  const longSleepBonus = type === "long_sleep" ? 3600 : 0;
  const napPenalty = type === "nap" ? 14_400 : 0;

  return totalSleep + overnightBonus + longSleepBonus - napPenalty;
}
