import { describe, expect, it } from 'vitest';
import { ORDER_STATUS_ORDER, PENDING_APPROVAL_STATUSES, canIssueTaxInvoice } from '../order-status';

describe('canIssueTaxInvoice', () => {
  it.each(PENDING_APPROVAL_STATUSES)('blocks %s because the order is not approved yet', (status) => {
    expect(canIssueTaxInvoice(status)).toBe(false);
  });

  it('blocks cancelled orders', () => {
    expect(canIssueTaxInvoice('CANCELLED')).toBe(false);
  });

  it('blocks a missing status', () => {
    expect(canIssueTaxInvoice(undefined)).toBe(false);
    expect(canIssueTaxInvoice(null)).toBe(false);
    expect(canIssueTaxInvoice('')).toBe(false);
  });

  it('allows every status from CONFIRMED onwards', () => {
    const approved = ORDER_STATUS_ORDER.filter((s) => s !== 'CANCELLED' && !PENDING_APPROVAL_STATUSES.includes(s));
    expect(approved[0]).toBe('CONFIRMED');
    for (const status of approved) expect(canIssueTaxInvoice(status)).toBe(true);
  });
});
