import {
  buildTrailingDateKeys,
  diffMinutes,
  formatShortDate,
  toDateKey,
} from "./datetime";
import { chooseMainOvernightSession, parseStageEpochs } from "./ouraAdapter";
import { extractFinalRemSegments } from "./remExtraction";
import type {
  NormalizedSleepDay,
  ResolvedSource,
  SleepStage,
  TimelineSegment,
} from "../types/app";
import type { OuraSleepSession } from "../types/oura";

const stageLabels: Record<SleepStage, string> = {
  awake: "Awake",
  light: "Light",
  deep: "Deep",
  rem: "REM",
  unknown: "Unknown",
};

export function normalizeSleepSessions(
  sessions: OuraSleepSession[],
  source: ResolvedSource,
): NormalizedSleepDay[] {
  const byDay = new Map<string, OuraSleepSession[]>();

  for (const session of sessions) {
    const dayKey = resolveDayKey(session);
    if (!dayKey) {
      continue;
    }

    const existing = byDay.get(dayKey) ?? [];
    existing.push(session);
    byDay.set(dayKey, existing);
  }

  return buildTrailingDateKeys(7).map((dateKey) => {
    const mainSession = chooseMainOvernightSession(byDay.get(dateKey) ?? []);
    if (!mainSession) {
      return buildMissingDay(dateKey, source);
    }

    return normalizeSingleSession(mainSession, source, dateKey);
  });
}

function normalizeSingleSession(
  session: OuraSleepSession,
  source: ResolvedSource,
  dateKey: string,
): NormalizedSleepDay {
  const bedtime = session.bedtime_start ?? null;
  const finalWakeTime = session.bedtime_end ?? null;
  const totalSleepSeconds =
    session.total_sleep_duration ??
    clampTotalSleepFromDurations(session) ??
    session.duration ??
    null;
  const spanMinutes = Math.max(
    diffMinutes(bedtime, finalWakeTime),
    Math.round((session.time_in_bed ?? 0) / 60),
    Math.round((session.duration ?? 0) / 60),
  );

  const epochStages = parseStageEpochs(session);
  const timeline = buildTimelineSegments(epochStages, bedtime);
  const remSegments = timeline.filter((segment) => segment.stage === "rem");
  const highlightedRemSegments = extractFinalRemSegments(timeline);
  const lastTimelineSegment = timeline[timeline.length - 1];

  let status: NormalizedSleepDay["status"] = "ready";
  let note: string | undefined;

  if (!timeline.length) {
    status = "partial";
    note =
      "Stage-level timing is not available for this session, so DreamCatcher can only show summary sleep times.";
  } else if (!highlightedRemSegments.length) {
    status = "partial";
    note =
      "No REM segments appeared in the stage timeline for this night, so there is nothing to highlight before wake.";
  }

  return {
    id: session.id ?? `${source}-${dateKey}`,
    source,
    dateKey,
    dateLabel: formatShortDate(dateKey),
    status,
    bedtime,
    finalWakeTime,
    totalSleepSeconds,
    totalSpanMinutes: Math.max(
      spanMinutes,
      lastTimelineSegment?.endOffsetMinutes ?? 0,
    ),
    timeline,
    remSegments,
    highlightedRemSegments,
    note,
  };
}

function buildTimelineSegments(
  epochStages: SleepStage[],
  bedtime?: string | null,
): TimelineSegment[] {
  if (!epochStages.length || !bedtime) {
    return [];
  }

  const start = new Date(bedtime);
  const segments: TimelineSegment[] = [];
  let cursor = 0;

  while (cursor < epochStages.length) {
    const stage = epochStages[cursor];
    let length = 1;

    while (cursor + length < epochStages.length && epochStages[cursor + length] === stage) {
      length += 1;
    }

    const startOffsetMinutes = cursor * 5;
    const endOffsetMinutes = (cursor + length) * 5;
    const startTime = new Date(start.getTime() + startOffsetMinutes * 60_000);
    const endTime = new Date(start.getTime() + endOffsetMinutes * 60_000);

    segments.push({
      stage,
      label: stageLabels[stage],
      startTime: startTime.toISOString(),
      endTime: endTime.toISOString(),
      startOffsetMinutes,
      endOffsetMinutes,
      durationMinutes: length * 5,
    });

    cursor += length;
  }

  return segments;
}

function clampTotalSleepFromDurations(session: OuraSleepSession): number | null {
  const sleepOnly =
    (session.deep_sleep_duration ?? 0) +
    (session.light_sleep_duration ?? 0) +
    (session.rem_sleep_duration ?? 0);

  return sleepOnly > 0 ? sleepOnly : null;
}

function buildMissingDay(dateKey: string, source: ResolvedSource): NormalizedSleepDay {
  return {
    id: `${source}-${dateKey}`,
    source,
    dateKey,
    dateLabel: formatShortDate(dateKey),
    status: "missing",
    totalSpanMinutes: 0,
    timeline: [],
    remSegments: [],
    highlightedRemSegments: [],
    note: "No overnight sleep session was available for this date.",
  };
}

function resolveDayKey(session: OuraSleepSession): string | null {
  if (session.day) {
    return session.day;
  }

  if (session.bedtime_end) {
    return toDateKey(new Date(session.bedtime_end));
  }

  if (session.bedtime_start) {
    const bedtime = new Date(session.bedtime_start);
    bedtime.setDate(bedtime.getDate() + 1);
    return toDateKey(bedtime);
  }

  return null;
}
