import { describe, expect, it } from 'vitest';
import { groupInvoiceRowsByStatus } from '@/lib/utils/invoice-groups';

const order = (id: string, order_status: string) => ({ id, order_status });
const invoice = (sale_order_id: string, status: string, invoice_no: string) => ({ sale_order_id, status, invoice_no });

describe('groupInvoiceRowsByStatus', () => {
  it('keeps only CONFIRMED-onwards, non-cancelled orders', () => {
    const groups = groupInvoiceRowsByStatus(
      [order('a', 'DRAFT'), order('b', 'SUBMITTED'), order('c', 'ADMIN_REVIEW'), order('d', 'CANCELLED'), order('e', 'CONFIRMED')],
      [],
    );
    expect(groups.map((g) => g.status)).toEqual(['CONFIRMED']);
    expect(groups[0].rows.map((r) => r.order.id)).toEqual(['e']);
  });

  it('orders groups by lifecycle, not by input order', () => {
    const groups = groupInvoiceRowsByStatus([order('a', 'COMPLETED'), order('b', 'CONFIRMED'), order('c', 'PAID'), order('d', 'CONFIRMED')], []);
    expect(groups.map((g) => g.status)).toEqual(['CONFIRMED', 'PAID', 'COMPLETED']);
    expect(groups[0].rows.map((r) => r.order.id)).toEqual(['b', 'd']);
  });

  it('prefers the active invoice over cancelled ones', () => {
    const [group] = groupInvoiceRowsByStatus(
      [order('a', 'PAID')],
      [invoice('a', 'CANCELLED', 'IV-2'), invoice('a', 'ISSUED', 'IV-1')],
    );
    expect(group.rows[0].invoice?.invoice_no).toBe('IV-1');
  });

  it('falls back to the latest cancelled invoice, or null when none', () => {
    const groups = groupInvoiceRowsByStatus(
      [order('a', 'CONFIRMED'), order('b', 'CONFIRMED')],
      [invoice('a', 'CANCELLED', 'IV-3'), invoice('a', 'CANCELLED', 'IV-1')],
    );
    expect(groups[0].rows[0].invoice?.invoice_no).toBe('IV-3');
    expect(groups[0].rows[1].invoice).toBeNull();
  });
});
