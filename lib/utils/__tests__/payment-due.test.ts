import { describe, expect, it } from 'vitest';
import { daysBetween, paymentDueLabel, paymentDueStatus } from '@/lib/utils/payment-due';

const today = '2026-11-09';

describe('daysBetween', () => {
  it('counts whole days across months', () => {
    expect(daysBetween('2026-10-31', '2026-11-09')).toBe(9);
    expect(daysBetween('2026-11-09', '2026-11-09')).toBe(0);
    expect(daysBetween('2026-11-10', '2026-11-09')).toBe(-1);
  });
});

describe('paymentDueStatus', () => {
  it('ignores draft and cancelled orders', () => {
    expect(paymentDueStatus({ order_status: 'DRAFT', due_date: '2026-01-01', outstanding_amount: 100 }, today).status).toBe('NONE');
    expect(paymentDueStatus({ order_status: 'CANCELLED', due_date: '2026-01-01', outstanding_amount: 100 }, today).status).toBe('NONE');
  });

  it('treats a fully paid order as paid even past due', () => {
    expect(paymentDueStatus({ order_status: 'DELIVERED', due_date: '2026-01-01', outstanding_amount: 0 }, today).status).toBe('PAID');
  });

  it('flags overdue with the day count', () => {
    expect(paymentDueStatus({ order_status: 'DELIVERED', due_date: '2026-11-01', outstanding_amount: 50 }, today))
      .toEqual({ status: 'OVERDUE', daysOverdue: 8 });
  });

  it('handles due today, not due and missing due date', () => {
    expect(paymentDueStatus({ order_status: 'CONFIRMED', due_date: today, outstanding_amount: 1 }, today).status).toBe('DUE_TODAY');
    expect(paymentDueStatus({ order_status: 'CONFIRMED', due_date: '2026-11-20', outstanding_amount: 1 }, today).status).toBe('NOT_DUE');
    expect(paymentDueStatus({ order_status: 'CONFIRMED', due_date: null, outstanding_amount: 1 }, today).status).toBe('NO_DUE_DATE');
  });
});

describe('paymentDueLabel', () => {
  it('gives Thai labels', () => {
    expect(paymentDueLabel({ status: 'OVERDUE', daysOverdue: 3 })).toEqual({ label: 'เกินกำหนด 3 วัน', color: 'error' });
    expect(paymentDueLabel({ status: 'PAID', daysOverdue: 0 })?.label).toBe('ชำระครบ');
    expect(paymentDueLabel({ status: 'NONE', daysOverdue: 0 })).toBeNull();
  });
});
