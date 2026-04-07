import {
  formatClockTime,
  formatDurationFromSeconds,
} from "../services/datetime";
import type { NormalizedSleepDay } from "../types/app";
import { SleepTimeline } from "./SleepTimeline";

interface SelectedSleepPanelProps {
  day: NormalizedSleepDay | null;
  includedInSuggestion: boolean;
  canInclude: boolean;
  onIncludedChange: (checked: boolean) => void;
}

export function SelectedSleepPanel({
  day,
  includedInSuggestion,
  canInclude,
  onIncludedChange,
}: SelectedSleepPanelProps) {
  if (!day) {
    return (
      <section className="panel detail-panel">
        <div className="panel__header">
          <div>
            <p className="panel__eyebrow">Selected Night</p>
            <h2>No day selected yet</h2>
          </div>
        </div>
        <p className="panel__note">
          Click a day card to pin its sleep timeline here.
        </p>
      </section>
    );
  }

  const heading =
    day.status === "missing"
      ? `${day.dateLabel} has no sleep data yet`
      : `${day.dateLabel} sleep timestream`;

  return (
    <section className="panel detail-panel">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">Selected Night</p>
          <h2>{heading}</h2>
        </div>
        <label
          className={`toggle-chip ${includedInSuggestion && canInclude ? "toggle-chip--checked" : ""} ${!canInclude ? "toggle-chip--disabled" : ""}`}
        >
          <input
            type="checkbox"
            checked={includedInSuggestion && canInclude}
            disabled={!canInclude}
            onChange={(event) => onIncludedChange(event.target.checked)}
          />
          <span>
            {canInclude
              ? "Count in tonight's WILD estimate"
              : "Not eligible for the estimate"}
          </span>
        </label>
      </div>

      <dl className="detail-panel__metrics">
        <div className="metric-chip">
          <span className="metric-chip__label">Bedtime</span>
          <strong>{formatClockTime(day.bedtime)}</strong>
        </div>
        <div className="metric-chip">
          <span className="metric-chip__label">Final wake</span>
          <strong>{formatClockTime(day.finalWakeTime)}</strong>
        </div>
        <div className="metric-chip">
          <span className="metric-chip__label">Total sleep</span>
          <strong>{formatDurationFromSeconds(day.totalSleepSeconds)}</strong>
        </div>
        <div className="metric-chip">
          <span className="metric-chip__label">Final REM blocks</span>
          <strong>{day.highlightedRemSegments.length || "None"}</strong>
        </div>
      </dl>

      <SleepTimeline
        segments={day.timeline}
        highlightedSegments={day.highlightedRemSegments}
        totalSpanMinutes={day.totalSpanMinutes ?? 0}
      />

      <div className="pill-row">
        {day.highlightedRemSegments.length ? (
          day.highlightedRemSegments.map((segment, index) => (
            <div key={`${day.id}-focus-rem-${segment.startOffsetMinutes}`} className="rem-pill">
              <span>REM {index + 1}</span>
              <strong>
                {formatClockTime(segment.startTime)} to {formatClockTime(segment.endTime)}
              </strong>
            </div>
          ))
        ) : (
          <p className="panel__note">No final REM blocks could be isolated for this night.</p>
        )}
      </div>

      {day.note ? <p className="panel__note">{day.note}</p> : null}
    </section>
  );
}
