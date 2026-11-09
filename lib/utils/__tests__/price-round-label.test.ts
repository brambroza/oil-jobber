import { describe, expect, it } from 'vitest';
import { priceRoundLabel, roundTime } from '@/lib/utils/price-round-label';

describe('roundTime', () => {
  it('reads HH:mm from timestamps and plain times', () => {
    expect(roundTime('2026-11-09T08:30:00+00:00')).toBe('08:30');
    expect(roundTime('2026-11-09 17:05:00')).toBe('17:05');
    expect(roundTime('06:00')).toBe('06:00');
    expect(roundTime(null)).toBe('');
  });
});

describe('priceRoundLabel', () => {
  const base = { effective_date: '2026-11-09', effective_at: '2026-11-09T08:30:00+00:00', expires_date: null, expires_at: null };

  it('shows one date with a time range when from and to are the same day', () => {
    expect(priceRoundLabel({ ...base, expires_date: '2026-11-09', expires_at: '2026-11-09T17:00:00+00:00' }))
      .toBe('09/11/2026 08:30–17:00 น.');
  });

  it('shows both dates when the round spans days', () => {
    expect(priceRoundLabel({ ...base, expires_date: '2026-11-10', expires_at: '2026-11-10T05:00:00+00:00', is_current: true }))
      .toBe('09/11/2026 08:30 น. – 10/11/2026 05:00 น. (ล่าสุด)');
  });

  it('shows the start only when there is no expiry', () => {
    expect(priceRoundLabel(base)).toBe('09/11/2026 08:30 น.');
    expect(priceRoundLabel({ ...base, effective_at: null })).toBe('09/11/2026');
  });
});
