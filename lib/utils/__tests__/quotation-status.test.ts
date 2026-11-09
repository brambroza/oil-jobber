import { describe, expect, it } from 'vitest';
import { isQuotationExpired, quotationDisplayStatus, QUOTATION_STATUS_LABELS } from '../quotation-status';

const TODAY = '2026-11-09';

describe('isQuotationExpired', () => {
  it('is expired only after the validity date', () => {
    expect(isQuotationExpired('2026-11-08', TODAY)).toBe(true);
    expect(isQuotationExpired('2026-11-09', TODAY)).toBe(false);
    expect(isQuotationExpired('2026-11-10', TODAY)).toBe(false);
    expect(isQuotationExpired(null, TODAY)).toBe(false);
  });
});

describe('quotationDisplayStatus', () => {
  const issued = (valid_until: string | null) => ({ status: 'ISSUED', valid_until });

  it('pending without a quotation number', () => {
    expect(quotationDisplayStatus('PENDING', null, TODAY)).toBe('NOT_ISSUED');
  });

  it('pending and issued: waiting until the validity date passes', () => {
    expect(quotationDisplayStatus('PENDING', issued('2026-11-09'), TODAY)).toBe('WAITING');
    expect(quotationDisplayStatus('PENDING', issued(null), TODAY)).toBe('WAITING');
    expect(quotationDisplayStatus('PENDING', issued('2026-11-01'), TODAY)).toBe('EXPIRED');
  });

  it('converted is accepted even after expiry', () => {
    expect(quotationDisplayStatus('CONVERTED', { status: 'ACCEPTED', valid_until: '2026-01-01' }, TODAY)).toBe('ACCEPTED');
  });

  it('closed: rejected vs cancelled', () => {
    expect(quotationDisplayStatus('CLOSED', { status: 'REJECTED', valid_until: null }, TODAY)).toBe('REJECTED');
    expect(quotationDisplayStatus('CLOSED', null, TODAY)).toBe('CANCELLED');
  });

  it('has a Thai label for every status', () => {
    for (const status of ['NOT_ISSUED', 'WAITING', 'EXPIRED', 'ACCEPTED', 'REJECTED', 'CANCELLED'] as const) {
      expect(QUOTATION_STATUS_LABELS[status]).toBeTruthy();
    }
  });
});
