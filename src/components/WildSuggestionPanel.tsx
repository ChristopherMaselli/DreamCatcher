import {
  formatMinutesAsClock,
  formatMinutesAsOffset,
} from "../services/datetime";
import type { ResolvedSource, WildSuggestion } from "../types/app";

interface WildSuggestionPanelProps {
  suggestion: WildSuggestion;
  source: ResolvedSource;
  fetchedAt: string;
  bedtimeCutoffMinutes: number;
  onCutoffChange: (minutes: number) => void;
}

export function WildSuggestionPanel({
  suggestion,
  source,
  fetchedAt,
  bedtimeCutoffMinutes,
  onCutoffChange,
}: WildSuggestionPanelProps) {
  return (
    <section className="panel panel--suggestion">
      <div className="panel__header">
        <div>
          <p className="panel__eyebrow">WILD Helper</p>
          <h2>Ideal time tonight to WILD</h2>
        </div>
        <span className={`status-pill ${source === "live" ? "status-pill--live" : "status-pill--mock"}`}>
          {source === "live" ? "Live Oura data" : "Mock week active"}
        </span>
      </div>

      {suggestion.status === "unavailable" ? (
        <p className="suggestion__headline">{suggestion.explanation}</p>
      ) : (
        <>
          <p className="suggestion__headline">
            {suggestion.windowStartClock} to {suggestion.windowEndClock}
          </p>
          <div className="suggestion__metrics">
            <div className="metric-chip">
              <span className="metric-chip__label">After sleep onset</span>
              <strong>
                {formatMinutesAsOffset(suggestion.windowStartOffsetMinutes)} to{" "}
                {formatMinutesAsOffset(suggestion.windowEndOffsetMinutes)}
              </strong>
            </div>
            <div className="metric-chip">
              <span className="metric-chip__label">Average bedtime</span>
              <strong>{suggestion.averageBedtimeClock ?? "—"}</strong>
            </div>
            <div className="metric-chip">
              <span className="metric-chip__label">Nights used</span>
              <strong>{suggestion.basisNights}</strong>
            </div>
            <div className="metric-chip">
              <span className="metric-chip__label">Unchecked nights</span>
              <strong>{suggestion.ignoredBySelection}</strong>
            </div>
            <div className="metric-chip">
              <span className="metric-chip__label">Past cutoff</span>
              <strong>{suggestion.ignoredByLateBedtime}</strong>
            </div>
            <div className="metric-chip">
              <span className="metric-chip__label">Cutoff</span>
              <strong>{formatMinutesAsClock(bedtimeCutoffMinutes)}</strong>
            </div>
          </div>
          <p className="panel__note">{suggestion.explanation}</p>
        </>
      )}

      <div className="slider-field">
        <label htmlFor="bedtime-cutoff">Discount nights where sleep started after {formatMinutesAsClock(bedtimeCutoffMinutes)}</label>
        <input
          id="bedtime-cutoff"
          type="range"
          min={60}
          max={300}
          step={15}
          value={bedtimeCutoffMinutes}
          onChange={(event) => onCutoffChange(Number(event.target.value))}
        />
        <div className="slider-field__labels">
          <span>1:00 AM</span>
          <span>{formatMinutesAsClock(bedtimeCutoffMinutes)}</span>
          <span>5:00 AM</span>
        </div>
        <p className="panel__note">
          This only filters truly late after-midnight starts. Evening bedtimes still count normally.
        </p>
      </div>

      <p className="panel__footer">
        Last dashboard refresh: {new Date(fetchedAt).toLocaleString()}
      </p>
    </section>
  );
}
