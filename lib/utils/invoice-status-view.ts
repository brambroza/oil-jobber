/**
 * Display model for the two status columns on the tax invoice page:
 * the document itself (สถานะใบกำกับ) and the money (สถานะชำระ).
 * Client-safe; pure functions only.
 */
import { daysBetween, paymentDueStatus } from '@/lib/utils/payment-due';

export type StatusTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';

export type StatusView = {
  /** Main label shown in the chip. */
  label: string;
  /** Optional second line under the chip (amount owed, days left, ...). */
  detail?: string;
  tone: StatusTone;
};

export type InvoiceDocStatus = 'NOT_ISSUED' | 'ISSUED' | 'CANCELLED';

/**
 * Document status of an order's tax invoice, independent of payment.
 *
 * @param invoiceStatus - status of the order's latest invoice, or null when none was issued
 * @returns `ISSUED` for both ISSUED and PAID invoices (payment lives in the other column)
 */
export function invoiceDocStatus(invoiceStatus: string | null | undefined): InvoiceDocStatus {
  if (!invoiceStatus) return 'NOT_ISSUED';
  if (invoiceStatus === 'CANCELLED') return 'CANCELLED';
  return 'ISSUED';
}

/**
 * Chip label/tone for the document status column.
 * @param status - result of {@link invoiceDocStatus}
 */
export function invoiceDocView(status: InvoiceDocStatus): StatusView {
  switch (status) {
    case 'ISSUED': return { label: 'ออกแล้ว', tone: 'info' };
    case 'CANCELLED': return { label: 'ยกเลิกแล้ว', detail: 'ออกใบใหม่ได้', tone: 'neutral' };
    default: return { label: 'ยังไม่ออก', tone: 'neutral' };
  }
}

const money = (value: number) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Chip label/tone for the payment column, combining how much is still owed
 * with how close the due date is.
 *
 * @param input.order_status - `sale_orders.order_status`
 * @param input.due_date - invoice due date, else the order's (`YYYY-MM-DD`)
 * @param input.total_amount - bill total
 * @param input.outstanding_amount - total minus recorded payments
 * @param input.invoice_paid - true when the active invoice is marked PAID
 * @param today - today's date `YYYY-MM-DD` (Asia/Bangkok)
 * @returns null when the order is not billable (draft/cancelled)
 */
export function paymentView(
  input: {
    order_status: string;
    due_date: string | null | undefined;
    total_amount: number;
    outstanding_amount: number;
    invoice_paid?: boolean;
  },
  today: string,
): StatusView | null {
  const outstanding = input.invoice_paid ? 0 : Math.max(0, Number(input.outstanding_amount || 0));
  const due = paymentDueStatus({ order_status: input.order_status, due_date: input.due_date, outstanding_amount: outstanding }, today);
  if (due.status === 'NONE') return null;
  if (due.status === 'PAID') return { label: 'ชำระครบ', tone: 'success' };

  const partial = outstanding < Number(input.total_amount || 0) - 0.005;
  const owed = `${partial ? 'ค้าง' : 'ยอด'} ${money(outstanding)} บาท`;

  switch (due.status) {
    case 'OVERDUE':
      return { label: `เกินกำหนด ${due.daysOverdue} วัน`, detail: owed, tone: 'error' };
    case 'DUE_TODAY':
      return { label: 'ครบกำหนดวันนี้', detail: owed, tone: 'warning' };
    case 'NOT_DUE': {
      const daysLeft = daysBetween(today, String(input.due_date));
      return { label: partial ? 'ชำระบางส่วน' : 'รอชำระ', detail: `${owed} · อีก ${daysLeft} วัน`, tone: partial ? 'info' : 'neutral' };
    }
    default:
      return { label: partial ? 'ชำระบางส่วน' : 'รอชำระ', detail: `${owed} · ไม่มีกำหนด`, tone: partial ? 'info' : 'neutral' };
  }
}
