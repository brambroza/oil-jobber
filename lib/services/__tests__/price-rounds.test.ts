import { describe, expect, it } from 'vitest';
import { isRoundActive, MAX_ROUNDS_PER_REFINERY, normalizeTime, selectPriceRounds, type PriceRoundRow } from '../price-rounds';

/** Builds a price round row with sensible defaults. */
function round(id: string, refineryId: string, effectiveDate: string, extra: Partial<PriceRoundRow> = {}): PriceRoundRow {
  return {
    id,
    refinery_id: refineryId,
    effective_date: effectiveDate,
    effective_at: null,
    expires_date: null,
    expires_at: null,
    ...extra,
  };
}

const NOW_DATE = '2026-10-14';
const NOW_TIME = '10:00:00';

describe('normalizeTime', () => {
  it('pads missing seconds and falls back on empty/invalid input', () => {
    expect(normalizeTime('08:30', '00:00:00')).toBe('08:30:00');
    expect(normalizeTime('08:30:15', '00:00:00')).toBe('08:30:15');
    expect(normalizeTime('', '23:59:59')).toBe('23:59:59');
    expect(normalizeTime('abc', '00:00:00')).toBe('00:00:00');
  });
});

describe('isRoundActive', () => {
  it('rejects future rounds and expired rounds', () => {
    expect(isRoundActive(round('a', 'r1', '2026-10-15'), NOW_DATE, NOW_TIME)).toBe(false);
    expect(isRoundActive(round('a', 'r1', NOW_DATE, { effective_at: '11:00' }), NOW_DATE, NOW_TIME)).toBe(false);
    expect(isRoundActive(round('a', 'r1', '2026-10-10', { expires_date: '2026-10-13' }), NOW_DATE, NOW_TIME)).toBe(false);
    expect(isRoundActive(round('a', 'r1', '2026-10-10', { expires_date: NOW_DATE, expires_at: '10:00' }), NOW_DATE, NOW_TIME)).toBe(false);
  });

  it('accepts rounds in effect now', () => {
    expect(isRoundActive(round('a', 'r1', NOW_DATE, { effective_at: '09:00' }), NOW_DATE, NOW_TIME)).toBe(true);
    expect(isRoundActive(round('a', 'r1', '2026-10-10', { expires_date: NOW_DATE }), NOW_DATE, NOW_TIME)).toBe(true);
  });

  it('rejects rounds without an effective date', () => {
    expect(isRoundActive(round('a', 'r1', ''), NOW_DATE, NOW_TIME)).toBe(false);
  });
});

describe('selectPriceRounds', () => {
  const rounds = [
    round('future', 'r1', '2026-10-15'),
    round('r1-now', 'r1', '2026-10-14'),
    round('r1-old', 'r1', '2026-10-13'),
    round('r2-now', 'r2', '2026-10-12'),
  ];

  it('picks the latest active round per refinery by default', () => {
    const result = selectPriceRounds(rounds, [], NOW_DATE, NOW_TIME);
    expect(result.selected.map((r) => r.id).sort()).toEqual(['r1-now', 'r2-now']);
    expect(result.overrideFound).toBe(false);
    expect(result.options.filter((r) => r.is_current).map((r) => r.id).sort()).toEqual(['r1-now', 'r2-now']);
    expect(result.options.map((r) => r.id)).toContain('future');
  });

  it('replaces only the chosen refinery round when overridden', () => {
    const result = selectPriceRounds(rounds, [], NOW_DATE, NOW_TIME, 'r1-old');
    expect(result.overrideFound).toBe(true);
    expect(result.selected.map((r) => r.id).sort()).toEqual(['r1-old', 'r2-now']);
  });

  it('allows overriding with a round not yet in effect', () => {
    const result = selectPriceRounds(rounds, [], NOW_DATE, NOW_TIME, 'future');
    expect(result.selected.map((r) => r.id).sort()).toEqual(['future', 'r2-now']);
  });

  it('respects allowed refineries for both selection and override', () => {
    const result = selectPriceRounds(rounds, ['r2'], NOW_DATE, NOW_TIME, 'r1-old');
    expect(result.overrideFound).toBe(false);
    expect(result.selected.map((r) => r.id)).toEqual(['r2-now']);
    expect(result.options.map((r) => r.id)).toEqual(['r2-now']);
  });

  it('ignores an unknown override id', () => {
    const result = selectPriceRounds(rounds, [], NOW_DATE, NOW_TIME, 'missing');
    expect(result.overrideFound).toBe(false);
    expect(result.selected.map((r) => r.id).sort()).toEqual(['r1-now', 'r2-now']);
  });

  it('caps options per refinery but keeps the current round', () => {
    const many = Array.from({ length: MAX_ROUNDS_PER_REFINERY + 5 }, (_, i) =>
      round(`f${i}`, 'r1', `2027-01-${String(i + 1).padStart(2, '0')}`),
    ).reverse();
    const result = selectPriceRounds([...many, round('r1-now', 'r1', '2026-10-01')], [], NOW_DATE, NOW_TIME);
    expect(result.options).toHaveLength(MAX_ROUNDS_PER_REFINERY + 1);
    expect(result.options.at(-1)).toMatchObject({ id: 'r1-now', is_current: true });
  });
});
