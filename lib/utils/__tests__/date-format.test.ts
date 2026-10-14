import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from '@/lib/utils/date-format';

describe('formatDate', () => {
  it('formats a calendar date without time-zone shift', () => {
    expect(formatDate('2026-10-07')).toBe('07/10/2026');
  });

  it('uses the Bangkok calendar day for timestamps', () => {
    expect(formatDate('2026-10-06T18:30:00Z')).toBe('07/10/2026');
    expect(formatDate(new Date('2026-01-31T16:59:00Z'))).toBe('31/01/2026');
  });

  it('keeps a Gregorian year', () => {
    expect(formatDate('2026-10-14')).toMatch(/2026$/);
  });

  it('passes through already formatted values', () => {
    expect(formatDate('14/10/2026')).toBe('14/10/2026');
  });

  it('handles empty and invalid input', () => {
    expect(formatDate(null)).toBe('-');
    expect(formatDate('', '')).toBe('');
    expect(formatDate('not a date')).toBe('not a date');
  });
});

describe('formatDateTime', () => {
  it('formats Bangkok time in 24h', () => {
    expect(formatDateTime('2026-10-14T06:05:00Z')).toBe('14/10/2026 13:05');
    expect(formatDateTime('2026-10-14T17:30:00Z')).toBe('15/10/2026 00:30');
  });

  it('prints a date-only value without a time', () => {
    expect(formatDateTime('2026-10-14')).toBe('14/10/2026');
  });

  it('handles empty input', () => {
    expect(formatDateTime(undefined)).toBe('-');
  });
});
