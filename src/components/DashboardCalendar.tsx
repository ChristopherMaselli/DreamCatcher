import { canUseDayForSuggestion } from "../services/suggestionHeuristic";
import type { NormalizedSleepDay } from "../types/app";
import { DayCard } from "./DayCard";

interface DashboardCalendarProps {
  days: NormalizedSleepDay[];
  selectedDayId: string | null;
  includedDayIds: string[];
  onSelectDay: (dayId: string) => void;
  onIncludedChange: (dayId: string, included: boolean) => void;
}

export function DashboardCalendar({
  days,
  selectedDayId,
  includedDayIds,
  onSelectDay,
  onIncludedChange,
}: DashboardCalendarProps) {
  const includedDaySet = new Set(includedDayIds);

  return (
    <section className="calendar">
      {days.map((day) => (
        <DayCard
          key={day.id}
          day={day}
          selected={day.id === selectedDayId}
          includedInSuggestion={includedDaySet.has(day.id)}
          canInclude={canUseDayForSuggestion(day)}
          onSelect={onSelectDay}
          onIncludedChange={onIncludedChange}
        />
      ))}
    </section>
  );
}
