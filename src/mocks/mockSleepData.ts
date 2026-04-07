import type { OuraSleepSession } from "../types/oura";
import { toDateKey } from "../services/datetime";

type StageKey = "awake" | "light" | "deep" | "rem";

const stageCodes: Record<StageKey, string> = {
  awake: "4",
  light: "2",
  deep: "1",
  rem: "3",
};

type StagePlan = Array<[StageKey, number]>;

export function buildMockSleepSessions(referenceDate = new Date()): OuraSleepSession[] {
  const today = new Date(referenceDate);
  today.setHours(0, 0, 0, 0);

  const sessions: OuraSleepSession[] = [
    createNight(today, 6, [22, 48], [
      ["light", 8],
      ["deep", 6],
      ["light", 8],
      ["rem", 4],
      ["light", 7],
      ["deep", 5],
      ["light", 7],
      ["rem", 5],
      ["light", 7],
      ["deep", 3],
      ["light", 6],
      ["rem", 6],
      ["light", 4],
      ["rem", 5],
      ["awake", 2],
    ]),
    createNight(today, 5, [23, 4], [
      ["light", 7],
      ["deep", 5],
      ["light", 8],
      ["rem", 4],
      ["light", 8],
      ["deep", 4],
      ["light", 8],
      ["rem", 5],
      ["light", 7],
      ["deep", 2],
      ["light", 6],
      ["rem", 5],
      ["light", 4],
      ["rem", 6],
      ["awake", 2],
    ]),
    createNight(today, 4, [22, 57], [
      ["light", 7],
      ["deep", 6],
      ["light", 9],
      ["rem", 4],
      ["light", 7],
      ["deep", 4],
      ["light", 7],
      ["rem", 5],
      ["light", 6],
      ["deep", 2],
      ["light", 6],
      ["rem", 5],
      ["light", 5],
      ["rem", 5],
      ["awake", 3],
    ]),
    createNap(today, 4, [14, 15], [["light", 4], ["rem", 2], ["awake", 1]]),
    createIncompleteNight(today, 3, [23, 18], 436, 400),
    createNight(today, 2, [23, 7], [
      ["light", 9],
      ["deep", 7],
      ["light", 8],
      ["rem", 5],
      ["light", 9],
      ["deep", 5],
      ["light", 8],
      ["awake", 3],
    ]),
    createNight(today, 1, [22, 41], [
      ["light", 8],
      ["deep", 6],
      ["light", 8],
      ["rem", 4],
      ["light", 7],
      ["deep", 4],
      ["light", 7],
      ["rem", 5],
      ["light", 6],
      ["deep", 3],
      ["light", 6],
      ["rem", 6],
      ["light", 4],
      ["rem", 6],
      ["awake", 2],
    ]),
    createNight(today, 0, [22, 55], [
      ["light", 7],
      ["deep", 6],
      ["light", 8],
      ["rem", 4],
      ["light", 8],
      ["deep", 4],
      ["light", 7],
      ["rem", 5],
      ["light", 7],
      ["deep", 2],
      ["light", 6],
      ["rem", 6],
      ["light", 4],
      ["rem", 7],
      ["awake", 2],
    ]),
  ];

  return sessions;
}

function createNight(
  today: Date,
  dayOffset: number,
  bedtime: [number, number],
  stagePlan: StagePlan,
): OuraSleepSession {
  const wakeDate = new Date(today);
  wakeDate.setDate(today.getDate() - dayOffset);
  const sleepStart = new Date(wakeDate);
  sleepStart.setDate(wakeDate.getDate() - 1);
  sleepStart.setHours(bedtime[0], bedtime[1], 0, 0);

  const stageTimeline = stagePlan
    .flatMap(([stage, epochs]) => Array.from({ length: epochs }, () => stageCodes[stage]))
    .join("");

  const timeInBedSeconds = stageTimeline.length * 300;
  const awakeSeconds =
    stagePlan
      .filter(([stage]) => stage === "awake")
      .reduce((sum, [, epochs]) => sum + epochs, 0) * 300;
  const deepSeconds =
    stagePlan
      .filter(([stage]) => stage === "deep")
      .reduce((sum, [, epochs]) => sum + epochs, 0) * 300;
  const lightSeconds =
    stagePlan
      .filter(([stage]) => stage === "light")
      .reduce((sum, [, epochs]) => sum + epochs, 0) * 300;
  const remSeconds =
    stagePlan
      .filter(([stage]) => stage === "rem")
      .reduce((sum, [, epochs]) => sum + epochs, 0) * 300;

  const bedtimeEnd = new Date(sleepStart.getTime() + timeInBedSeconds * 1000);
  const day = toDateKey(wakeDate);

  return {
    id: `mock-${day}`,
    day,
    bedtime_start: sleepStart.toISOString(),
    bedtime_end: bedtimeEnd.toISOString(),
    total_sleep_duration: timeInBedSeconds - awakeSeconds,
    duration: timeInBedSeconds,
    time_in_bed: timeInBedSeconds,
    awake_time: awakeSeconds,
    deep_sleep_duration: deepSeconds,
    light_sleep_duration: lightSeconds,
    rem_sleep_duration: remSeconds,
    sleep_phase_5_min: stageTimeline,
    sleep_algorithm_version: "mock-v1",
    type: "long_sleep",
    status: "complete",
  };
}

function createIncompleteNight(
  today: Date,
  dayOffset: number,
  bedtime: [number, number],
  timeInBedMinutes: number,
  totalSleepMinutes: number,
): OuraSleepSession {
  const wakeDate = new Date(today);
  wakeDate.setDate(today.getDate() - dayOffset);
  const sleepStart = new Date(wakeDate);
  sleepStart.setDate(wakeDate.getDate() - 1);
  sleepStart.setHours(bedtime[0], bedtime[1], 0, 0);
  const bedtimeEnd = new Date(sleepStart.getTime() + timeInBedMinutes * 60_000);
  const day = toDateKey(wakeDate);

  return {
    id: `mock-${day}-partial`,
    day,
    bedtime_start: sleepStart.toISOString(),
    bedtime_end: bedtimeEnd.toISOString(),
    total_sleep_duration: totalSleepMinutes * 60,
    duration: timeInBedMinutes * 60,
    time_in_bed: timeInBedMinutes * 60,
    awake_time: (timeInBedMinutes - totalSleepMinutes) * 60,
    type: "long_sleep",
    status: "complete",
  };
}

function createNap(
  today: Date,
  dayOffset: number,
  bedtime: [number, number],
  stagePlan: StagePlan,
): OuraSleepSession {
  const wakeDate = new Date(today);
  wakeDate.setDate(today.getDate() - dayOffset);
  const sleepStart = new Date(wakeDate);
  sleepStart.setHours(bedtime[0], bedtime[1], 0, 0);

  const stageTimeline = stagePlan
    .flatMap(([stage, epochs]) => Array.from({ length: epochs }, () => stageCodes[stage]))
    .join("");
  const bedtimeEnd = new Date(sleepStart.getTime() + stageTimeline.length * 300_000);
  const day = toDateKey(wakeDate);

  return {
    id: `mock-nap-${day}`,
    day,
    bedtime_start: sleepStart.toISOString(),
    bedtime_end: bedtimeEnd.toISOString(),
    total_sleep_duration: stageTimeline.length * 300,
    duration: stageTimeline.length * 300,
    time_in_bed: stageTimeline.length * 300,
    sleep_phase_5_min: stageTimeline,
    type: "nap",
    status: "complete",
  };
}
