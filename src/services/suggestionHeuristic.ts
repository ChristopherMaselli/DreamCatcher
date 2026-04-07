import {
  formatMinutesAsClock,
  formatMinutesAsOffset,
  localMinutesOfDay,
} from "./datetime";
import type {
  NormalizedSleepDay,
  WildSuggestion,
  WildSuggestionOptions,
} from "../types/app";

const DEFAULT_BEDTIME_CUTOFF_MINUTES = 150;

export function buildWildSuggestion(
  days: NormalizedSleepDay[],
  options: WildSuggestionOptions = {},
): WildSuggestion {
  const baseEligible = days.filter(canUseDayForSuggestion);
  const includedIds = new Set(options.includedDayIds ?? days.map((day) => day.id));
  const cutoffMinutes = options.bedtimeCutoffMinutes ?? DEFAULT_BEDTIME_CUTOFF_MINUTES;

  const selectedDays = baseEligible.filter((day) => includedIds.has(day.id));
  const filteredDays = selectedDays.filter(
    (day) => bedtimeRelativeMinutes(day.bedtime!) <= cutoffMinutes,
  );
  const ignoredBySelection = baseEligible.length - selectedDays.length;
  const ignoredByLateBedtime = selectedDays.length - filteredDays.length;

  if (!baseEligible.length) {
    return {
      status: "unavailable",
      basisNights: 0,
      cutoffMinutes,
      ignoredBySelection: 0,
      ignoredByLateBedtime: 0,
      usedDayIds: [],
      explanation:
        "DreamCatcher needs at least one night with stage-level REM timing before it can suggest a manual WILD wake window.",
    };
  }

  if (!filteredDays.length) {
    const filteredMessage = ignoredByLateBedtime
      ? ` After your current bedtime cutoff of ${formatMinutesAsClock(cutoffMinutes)}, none of the selected nights remain.`
      : " None of the selected nights are currently included in the estimate.";

    return {
      status: "unavailable",
      basisNights: 0,
      cutoffMinutes,
      ignoredBySelection,
      ignoredByLateBedtime,
      usedDayIds: [],
      explanation:
        `DreamCatcher found ${baseEligible.length} night${baseEligible.length === 1 ? "" : "s"} with usable REM timing.` +
        filteredMessage +
        " Re-check one of the day boxes or relax the cutoff slider to rebuild tonight's estimate.",
    };
  }

  const basisNights = filteredDays.length;
  const averageBedtimeMinutes = Math.round(
    average(filteredDays.map((day) => localMinutesOfDay(day.bedtime!))),
  );
  const windowStartOffsetMinutes = Math.round(
    average(
      filteredDays.map((day) => day.highlightedRemSegments[0].startOffsetMinutes),
    ),
  );
  const windowEndOffsetMinutes = Math.round(
    average(
      filteredDays.map((day) => {
        const finalHighlighted =
          day.highlightedRemSegments[day.highlightedRemSegments.length - 1];
        const wakeOffset =
          Math.round(
            (new Date(day.finalWakeTime!).getTime() - new Date(day.bedtime!).getTime()) /
              60_000,
          ) || finalHighlighted.endOffsetMinutes;

        return Math.max(wakeOffset, finalHighlighted.endOffsetMinutes);
      }),
    ),
  );

  const averageBedtimeClock = formatMinutesAsClock(averageBedtimeMinutes);
  const windowStartClock = formatMinutesAsClock(
    averageBedtimeMinutes + windowStartOffsetMinutes,
  );
  const windowEndClock = formatMinutesAsClock(
    averageBedtimeMinutes + windowEndOffsetMinutes,
  );

  const status = basisNights >= 3 ? "ready" : "partial";
  const explanation = `Using ${basisNights} checked night${basisNights === 1 ? "" : "s"}, the final REM-heavy stretch usually starts about ${formatMinutesAsOffset(
    windowStartOffsetMinutes,
  )} after sleep onset and your final wake tends to land around ${formatMinutesAsOffset(
    windowEndOffsetMinutes,
  )}. Nights with sleep starts later than ${formatMinutesAsClock(
    cutoffMinutes,
  )} are ignored, while evening bedtimes still count as normal.`;

  return {
    status,
    basisNights,
    windowStartOffsetMinutes,
    windowEndOffsetMinutes,
    windowStartClock,
    windowEndClock,
    averageBedtimeClock,
    cutoffMinutes,
    ignoredBySelection,
    ignoredByLateBedtime,
    usedDayIds: filteredDays.map((day) => day.id),
    explanation,
  };
}

export function canUseDayForSuggestion(day: NormalizedSleepDay): boolean {
  return Boolean(
    day.bedtime &&
      day.finalWakeTime &&
      day.highlightedRemSegments.length > 0,
  );
}

function bedtimeRelativeMinutes(value: string): number {
  const minutes = localMinutesOfDay(value);
  return minutes >= 12 * 60 ? minutes - 1440 : minutes;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
