import { describe, expect, it } from 'vitest';
import { invoiceNumberYear, validateInvoiceIssueDate } from '@/lib/utils/invoice-dates';

const today = '2026-11-09';

describe('invoiceNumberYear', () => {
  it('reads the year of yearly and old daily numbers', () => {
    expect(invoiceNumberYear('IV-260001')).toBe('26');
    expect(invoiceNumberYear('IV-2510310004')).toBe('25');
  });

  it('returns null for other shapes', () => {
    expect(invoiceNumberYear('INV-001')).toBeNull();
    expect(invoiceNumberYear(null)).toBeNull();
    expect(invoiceNumberYear('')).toBeNull();
  });
});

describe('validateInvoiceIssueDate', () => {
  it('accepts today and earlier dates in the same year', () => {
    expect(validateInvoiceIssueDate('2026-11-09', { today })).toBeNull();
    expect(validateInvoiceIssueDate('2026-01-01', { today, invoiceNo: 'IV-260012' })).toBeNull();
  });

  it('rejects malformed or impossible dates', () => {
    expect(validateInvoiceIssueDate('09/11/2026', { today })).toBe('วันที่ออกใบกำกับภาษีไม่ถูกต้อง');
    expect(validateInvoiceIssueDate('2026-02-30', { today })).toBe('วันที่ออกใบกำกับภาษีไม่ถูกต้อง');
  });

  it('rejects future dates', () => {
    expect(validateInvoiceIssueDate('2026-11-10', { today })).toBe('วันที่ออกใบกำกับภาษีต้องไม่เกินวันนี้');
  });

  it('rejects a year that does not match the invoice number', () => {
    expect(validateInvoiceIssueDate('2025-12-31', { today, invoiceNo: 'IV-260003' }))
      .toBe('วันที่ออกต้องอยู่ในปี 2026 ตามเลขใบกำกับ IV-260003');
  });

  it('keeps an old invoice inside its own year', () => {
    expect(validateInvoiceIssueDate('2025-12-30', { today, invoiceNo: 'IV-2512310001' })).toBeNull();
  });

  it('rejects a new invoice dated in an earlier year', () => {
    expect(validateInvoiceIssueDate('2025-12-31', { today })).toBe('วันที่ออกต้องอยู่ในปี 2026 (เลขใบกำกับรันตามปี)');
  });

  it('rejects a due date before the issue date', () => {
    expect(validateInvoiceIssueDate('2026-11-05', { today, dueDate: '2026-11-04' }))
      .toBe('วันครบกำหนดต้องไม่ก่อนวันที่ออกใบกำกับภาษี');
    expect(validateInvoiceIssueDate('2026-11-05', { today, dueDate: '2026-11-05' })).toBeNull();
  });
});
