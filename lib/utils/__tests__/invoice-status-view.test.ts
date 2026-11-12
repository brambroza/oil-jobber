import { describe, expect, it } from 'vitest';
import { invoiceDocStatus, invoiceDocView, paymentView } from '@/lib/utils/invoice-status-view';

const TODAY = '2026-11-12';
const base = { order_status: 'CONFIRMED', total_amount: 1000, outstanding_amount: 1000 };

describe('invoiceDocStatus', () => {
  it('maps invoice statuses to document status', () => {
    expect(invoiceDocStatus(null)).toBe('NOT_ISSUED');
    expect(invoiceDocStatus('ISSUED')).toBe('ISSUED');
    expect(invoiceDocStatus('PAID')).toBe('ISSUED');
    expect(invoiceDocStatus('CANCELLED')).toBe('CANCELLED');
  });

  it('labels each document status', () => {
    expect(invoiceDocView('NOT_ISSUED').label).toBe('ยังไม่ออก');
    expect(invoiceDocView('ISSUED').tone).toBe('info');
    expect(invoiceDocView('CANCELLED').detail).toBe('ออกใบใหม่ได้');
  });
});

describe('paymentView', () => {
  it('returns null for non-billable orders', () => {
    expect(paymentView({ ...base, order_status: 'CANCELLED', due_date: TODAY }, TODAY)).toBeNull();
  });

  it('is paid when nothing is owed or the invoice is marked paid', () => {
    expect(paymentView({ ...base, outstanding_amount: 0, due_date: TODAY }, TODAY)?.label).toBe('ชำระครบ');
    expect(paymentView({ ...base, invoice_paid: true, due_date: '2026-11-01' }, TODAY)?.tone).toBe('success');
  });

  it('flags overdue with days and amount', () => {
    const v = paymentView({ ...base, due_date: '2026-11-09' }, TODAY);
    expect(v).toMatchObject({ label: 'เกินกำหนด 3 วัน', tone: 'error' });
    expect(v?.detail).toContain('1,000.00');
  });

  it('warns when due today', () => {
    expect(paymentView({ ...base, due_date: TODAY }, TODAY)?.tone).toBe('warning');
  });

  it('shows days left before the due date', () => {
    const v = paymentView({ ...base, due_date: '2026-11-20' }, TODAY);
    expect(v).toMatchObject({ label: 'รอชำระ', tone: 'neutral' });
    expect(v?.detail).toContain('อีก 8 วัน');
  });

  it('marks partial payments and shows the remaining amount', () => {
    const v = paymentView({ ...base, outstanding_amount: 400, due_date: '2026-11-20' }, TODAY);
    expect(v).toMatchObject({ label: 'ชำระบางส่วน', tone: 'info' });
    expect(v?.detail).toContain('ค้าง 400.00');
  });

  it('handles orders without a due date', () => {
    expect(paymentView({ ...base, due_date: null }, TODAY)?.detail).toContain('ไม่มีกำหนด');
  });
});
