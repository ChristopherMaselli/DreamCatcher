import type { TimelineSegment } from "../types/app";

export function extractFinalRemSegments(segments: TimelineSegment[]): TimelineSegment[] {
  return segments.filter((segment) => segment.stage === "rem").slice(-2);
}
