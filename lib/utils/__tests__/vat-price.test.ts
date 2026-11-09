import { describe, expect, it } from 'vitest';
import { toDisplayPrice, toUnitPriceInclVat } from '../vat-price';
import { parseOptionalVatMode } from '@/lib/documents/vat-mode';

describe('VatPriceInput conversions', () => {
  it('shows the stored incl. VAT price as is in incl mode', () => {
    expect(toDisplayPrice(32.1, 'incl')).toBe(32.1);
    expect(toUnitPriceInclVat(32.1, 'incl')).toBe(32.1);
  });

  it('shows and accepts the pre-VAT price in excl mode', () => {
    expect(toDisplayPrice(32.1, 'excl')).toBeCloseTo(30, 10);
    expect(toUnitPriceInclVat(30, 'excl')).toBe(32.1);
  });

  it('stores at most 4 decimals and round-trips typed pre-VAT prices', () => {
    for (const typed of [29.9, 29.1234, 31.5678, 0.0001]) {
      const stored = toUnitPriceInclVat(typed, 'excl');
      expect(Number(stored.toFixed(4))).toBe(stored);
      expect(Number(toDisplayPrice(stored, 'excl').toFixed(4))).toBe(typed);
    }
  });
});

describe('parseOptionalVatMode', () => {
  it('keeps only explicit modes', () => {
    expect(parseOptionalVatMode('incl')).toBe('incl');
    expect(parseOptionalVatMode('excl')).toBe('excl');
    expect(parseOptionalVatMode(null)).toBeUndefined();
    expect(parseOptionalVatMode('INCL')).toBeUndefined();
  });
});
