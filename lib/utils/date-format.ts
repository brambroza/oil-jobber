/**
 * System-wide date display: `DD/MM/YYYY` (Gregorian year, Asia/Bangkok).
 * Safe on server and client (no React, no DOM).
 */

const TIME_ZONE = 'Asia/Bangkok';
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const ALREADY_FORMATTED = /^\d{2}\/\d{2}\/\d{4}/;

type DateInput = string | Date | null | undefined;

/** Bangkok calendar parts of an instant. */
function bangkokParts(date: Date): Record<'day' | 'month' | 'year' | 'hour' | 'minute', string> {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '';
  return { day: get('day'), month: get('month'), year: get('year'), hour: get('hour'), minute: get('minute') };
}

/**
 * Formats a date for display as `DD/MM/YYYY`.
 *
 * @param value - `YYYY-MM-DD` (taken as a calendar date, no time-zone shift),
 *   an ISO timestamp or a Date; an already `DD/MM/YYYY` string passes through
 * @param fallback - shown for empty input
 * @returns formatted date, `fallback` when empty, or the raw string when unparseable
 */
export function formatDate(value: DateInput, fallback = '-'): string {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const dateOnly = DATE_ONLY.exec(trimmed);
    if (dateOnly) return `${dateOnly[3]}/${dateOnly[2]}/${dateOnly[1]}`;
    if (ALREADY_FORMATTED.test(trimmed)) return trimmed.slice(0, 10);
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const p = bangkokParts(date);
  return `${p.day}/${p.month}/${p.year}`;
}

/**
 * Formats an instant as `DD/MM/YYYY HH:mm` (Bangkok time, 24h).
 *
 * @param value - ISO timestamp or Date (a `YYYY-MM-DD` value prints the date only)
 * @param fallback - shown for empty input
 * @returns formatted date-time
 */
export function formatDateTime(value: DateInput, fallback = '-'): string {
  if (value == null || value === '') return fallback;
  if (typeof value === 'string' && DATE_ONLY.test(value.trim())) return formatDate(value, fallback);
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const p = bangkokParts(date);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}
