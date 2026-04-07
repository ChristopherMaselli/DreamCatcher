export interface OuraSleepSession {
  id?: string;
  day?: string;
  bedtime_start?: string | null;
  bedtime_end?: string | null;
  duration?: number | null;
  total_sleep_duration?: number | null;
  time_in_bed?: number | null;
  awake_time?: number | null;
  deep_sleep_duration?: number | null;
  light_sleep_duration?: number | null;
  rem_sleep_duration?: number | null;
  sleep_phase_5_min?: string | null;
  hypnogram_5min?: string | null;
  sleep_algorithm_version?: string | null;
  score?: number | null;
  status?: string | null;
  type?: string | null;
}

export interface CachedSleepPayload {
  fetchedAt: string;
  sessions: OuraSleepSession[];
}
