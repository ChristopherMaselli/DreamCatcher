import { canUseDayForSuggestion } from "../services/suggestionHeuristic";
import type { NormalizedSleepDay } from "../types/app";
import { DayCard } from "./DayCard";

interface DashboardCalendarProps {
  days: NormalizedSleepDay[];
  selectedDayId: string | null;
  includedDayIds: string[];
  showMissingDays: boolean;
  onSelectDay: (dayId: string) => void;
  onIncludedChange: (dayId: string, included: boolean) => void;
}

export function DashboardCalendar({
  days,
  selectedDayId,
  includedDayIds,
  showMissingDays,
  onSelectDay,
  onIncludedChange,
}: DashboardCalendarProps) {
  const includedDaySet = new Set(includedDayIds);
  const visibleDays = showMissingDays ? days : days.filter((day) => day.status !== "missing");

  if (!visibleDays.length) {
    return (
      <section className="panel panel--empty-state">
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">Sleep History</p>
            <h2>No live nights to show yet</h2>
          </div>
        </div>
        <p className="panel__note">
          DreamCatcher will only show days that actually returned sleep data. Right now this week is empty.
        </p>
      </section>
    );
  }

  return (
    <section className="calendar calendar--stacked">
      {visibleDays.map((day) => (
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
