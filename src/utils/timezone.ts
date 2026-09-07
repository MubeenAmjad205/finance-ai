/**
 * Robust Timezone & Date Utility for Finance AI.
 * 
 * DESIGN CONTRACT:
 * 1. Backend / Database: All timestamps stored and processed internally MUST BE STRICT UTC (ISO 8601, ending in 'Z').
 * 2. User Facing / Presentation: All timestamps displayed to the user (Telegram, Reports, Exports, Dashboard)
 *    are formatted according to the user's local timezone (Default: Pakistan Standard Time 'Asia/Karachi', UTC+5).
 */

export const DEFAULT_USER_TIMEZONE = 'Asia/Karachi';

/**
 * Returns current timestamp strictly in ISO UTC format (e.g. 2026-09-07T19:15:00.000Z).
 */
export function getUtcTimestamp(date: Date = new Date()): string {
  return date.toISOString();
}

/**
 * Get current year-month string in user's timezone (e.g. "2026-09").
 * Prevents off-by-one month bugs around midnight.
 */
export function getUserCurrentMonth(timeZone: string = DEFAULT_USER_TIMEZONE, refDate: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit'
  });
  return formatter.format(refDate); // "YYYY-MM"
}

/**
 * Get current date string in user's timezone (e.g. "2026-09-08").
 */
export function getUserCurrentDate(timeZone: string = DEFAULT_USER_TIMEZONE, refDate: Date = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(refDate); // "YYYY-MM-DD"
}

/**
 * Format any UTC timestamp into a human-friendly string in user's timezone.
 * Example output: "08 Sep 2026, 05:15 AM PKT"
 */
export function formatUserDateTime(
  utcTimestamp: string | Date | number,
  timeZone: string = DEFAULT_USER_TIMEZONE,
  includeTime = true
): string {
  if (!utcTimestamp) return 'N/A';
  try {
    const d = new Date(utcTimestamp);
    if (isNaN(d.getTime())) return String(utcTimestamp);

    const options: Intl.DateTimeFormatOptions = {
      timeZone,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      ...(includeTime ? {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZoneName: 'short'
      } : {})
    };

    return new Intl.DateTimeFormat('en-US', options).format(d);
  } catch (err) {
    return String(utcTimestamp);
  }
}

/**
 * Format timestamp into standard date format (e.g. "08 Sep 2026").
 */
export function formatUserDate(
  utcTimestamp: string | Date | number,
  timeZone: string = DEFAULT_USER_TIMEZONE
): string {
  return formatUserDateTime(utcTimestamp, timeZone, false);
}

/**
 * Format timestamp into standard time format (e.g. "05:15 AM PKT").
 */
export function formatUserTime(
  utcTimestamp: string | Date | number,
  timeZone: string = DEFAULT_USER_TIMEZONE
): string {
  if (!utcTimestamp) return '';
  try {
    const d = new Date(utcTimestamp);
    if (isNaN(d.getTime())) return '';

    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    }).format(d);
  } catch {
    return '';
  }
}
