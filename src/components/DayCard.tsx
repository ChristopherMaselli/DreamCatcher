import type { KeyboardEvent } from "react";
import {
  formatClockTime,
  formatDurationFromSeconds,
} from "../services/datetime";
import type { NormalizedSleepDay } from "../types/app";

interface DayCardProps {
  day: NormalizedSleepDay;
  selected: boolean;
  includedInSuggestion: boolean;
  canInclude: boolean;
  onSelect: (dayId: string) => void;
  onIncludedChange: (dayId: string, included: boolean) => void;
}

export function DayCard({
  day,
  selected,
  includedInSuggestion,
  canInclude,
  onSelect,
  onIncludedChange,
}: DayCardProps) {
  const statusLabel =
    day.status === "ready"
      ? "Ready"
      : day.status === "partial"
        ? "Partial"
        : "Missing";

  const summary =
    day.status === "missing"
      ? "No sleep data returned for this date yet."
      : day.note ??
        (day.highlightedRemSegments.length
          ? `${day.highlightedRemSegments.length} final REM block${day.highlightedRemSegments.length === 1 ? "" : "s"} isolated before wake.`
          : "No final REM blocks could be isolated for this night.");

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(day.id);
    }
  }

  return (
    <article
      className={`day-card ${selected ? "day-card--selected" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(day.id)}
      onKeyDown={handleKeyDown}
    >
      <div className="day-card__header">
        <div>
          <p className="panel__eyebrow">{day.dateLabel}</p>
          <h3>{statusLabel}</h3>
        </div>
        <span className={`status-pill ${day.source === "live" ? "status-pill--live" : "status-pill--mock"}`}>
          {day.source}
        </span>
      </div>

      <dl className="day-card__metrics">
        <div>
          <dt>Bedtime</dt>
          <dd>{formatClockTime(day.bedtime)}</dd>
        </div>
        <div>
          <dt>Wake</dt>
          <dd>{formatClockTime(day.finalWakeTime)}</dd>
        </div>
        <div>
          <dt>Total sleep</dt>
          <dd>{formatDurationFromSeconds(day.totalSleepSeconds)}</dd>
        </div>
        <div>
          <dt>Final REM blocks</dt>
          <dd>{day.highlightedRemSegments.length || "None"}</dd>
        </div>
      </dl>

      <p className="day-card__summary">{summary}</p>

      <label
        className={`toggle-chip ${includedInSuggestion && canInclude ? "toggle-chip--checked" : ""} ${!canInclude ? "toggle-chip--disabled" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={includedInSuggestion && canInclude}
          disabled={!canInclude}
          onChange={(event) => onIncludedChange(day.id, event.target.checked)}
        />
        <span>
          {canInclude
            ? "Count in tonight's WILD estimate"
            : "Not eligible for the estimate"}
        </span>
      </label>
    </article>
  );
}
