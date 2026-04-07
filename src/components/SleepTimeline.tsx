import { formatClockTime } from "../services/datetime";
import type { TimelineSegment } from "../types/app";

interface SleepTimelineProps {
  segments: TimelineSegment[];
  highlightedSegments: TimelineSegment[];
  totalSpanMinutes: number;
}

const stageClassMap = {
  awake: "timeline__segment--awake",
  light: "timeline__segment--light",
  deep: "timeline__segment--deep",
  rem: "timeline__segment--rem",
  unknown: "timeline__segment--unknown",
};

export function SleepTimeline({
  segments,
  highlightedSegments,
  totalSpanMinutes,
}: SleepTimelineProps) {
  if (!segments.length || totalSpanMinutes <= 0) {
    return <div className="timeline timeline--empty">No stage timeline available.</div>;
  }

  return (
    <div className="timeline-wrapper">
      <div className="timeline" aria-label="Sleep stage timeline">
        {segments.map((segment) => {
          const left = (segment.startOffsetMinutes / totalSpanMinutes) * 100;
          const width = (segment.durationMinutes / totalSpanMinutes) * 100;
          const isHighlighted = highlightedSegments.some(
            (highlighted) =>
              highlighted.startOffsetMinutes === segment.startOffsetMinutes &&
              highlighted.endOffsetMinutes === segment.endOffsetMinutes,
          );

          return (
            <div
              key={`${segment.startOffsetMinutes}-${segment.endOffsetMinutes}`}
              className={`timeline__segment ${stageClassMap[segment.stage]} ${isHighlighted ? "timeline__segment--highlighted" : ""}`}
              style={{ left: `${left}%`, width: `${width}%` }}
              title={`${segment.label}: ${formatClockTime(segment.startTime)} to ${formatClockTime(segment.endTime)}`}
            />
          );
        })}
        <div className="timeline__wake-marker" title="Final wake-up point" />
      </div>
      <div className="timeline__legend">
        <span><i className="swatch swatch--light" />Light</span>
        <span><i className="swatch swatch--deep" />Deep</span>
        <span><i className="swatch swatch--rem" />REM</span>
        <span><i className="swatch swatch--awake" />Awake</span>
      </div>
    </div>
  );
}
