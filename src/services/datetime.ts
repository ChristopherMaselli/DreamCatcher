const shortDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function buildTrailingDateKeys(days: number): string[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (days - 1 - index));
    return toDateKey(date);
  });
}

export function formatShortDate(dateKey: string): string {
  return shortDateFormatter.format(new Date(`${dateKey}T00:00:00`));
}

export function formatClockTime(value?: string | null): string {
  if (!value) {
    return "—";
  }

  return timeFormatter.format(new Date(value));
}

export function formatDurationFromSeconds(seconds?: number | null): string {
  if (!seconds || seconds <= 0) {
    return "—";
  }

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return `${hours}h ${minutes.toString().padStart(2, "0")}m`;
}

export function formatMinutesAsOffset(minutes?: number): string {
  if (minutes === undefined || Number.isNaN(minutes)) {
    return "—";
  }

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours}h ${remainder.toString().padStart(2, "0")}m`;
}

export function formatMinutesAsClock(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const date = new Date();
  date.setHours(Math.floor(normalized / 60), normalized % 60, 0, 0);
  return timeFormatter.format(date);
}

export function localMinutesOfDay(value: string): number {
  const date = new Date(value);
  return date.getHours() * 60 + date.getMinutes();
}

export function diffMinutes(start?: string | null, end?: string | null): number {
  if (!start || !end) {
    return 0;
  }

  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}
