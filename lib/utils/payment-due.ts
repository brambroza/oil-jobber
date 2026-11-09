/**
 * Payment due status of a sale order for the orders list (สถานะเกินกำหนดชำระ).
 * Client-safe: works on fields the orders API already returns.
 */

export type PaymentDueStatus = 'NONE' | 'PAID' | 'NO_DUE_DATE' | 'NOT_DUE' | 'DUE_TODAY' | 'OVERDUE';

/** Order statuses that never owe money (not started / cancelled). */
const NOT_BILLABLE_STATUSES = ['DRAFT', 'CANCELLED'];

/**
 * Whole days between two `YYYY-MM-DD` dates (`to - from`).
 * @param from - start date
 * @param to - end date
 */
export function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to.slice(0, 10)}T00:00:00Z`) - Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Works out whether an order's payment is overdue.
 *
 * @param input - order status, due date (invoice due date first, else the
 *   order's), and the amount still owed
 * @param today - today's date `YYYY-MM-DD` (Asia/Bangkok)
 * @returns status plus the number of days overdue (0 unless OVERDUE)
 */
export function paymentDueStatus(
  input: { order_status: string; due_date: string | null | undefined; outstanding_amount: number | null | undefined },
  today: string,
): { status: PaymentDueStatus; daysOverdue: number } {
  if (NOT_BILLABLE_STATUSES.includes(input.order_status)) return { status: 'NONE', daysOverdue: 0 };
  if (Number(input.outstanding_amount ?? 0) <= 0.005) return { status: 'PAID', daysOverdue: 0 };
  if (!input.due_date) return { status: 'NO_DUE_DATE', daysOverdue: 0 };
  const diff = daysBetween(input.due_date, today);
  if (diff > 0) return { status: 'OVERDUE', daysOverdue: diff };
  if (diff === 0) return { status: 'DUE_TODAY', daysOverdue: 0 };
  return { status: 'NOT_DUE', daysOverdue: 0 };
}

/** Thai chip label and color for a payment due status. */
export function paymentDueLabel(
  due: { status: PaymentDueStatus; daysOverdue: number },
): { label: string; color: 'default' | 'success' | 'warning' | 'error' } | null {
  switch (due.status) {
    case 'OVERDUE': return { label: `เกินกำหนด ${due.daysOverdue} วัน`, color: 'error' };
    case 'DUE_TODAY': return { label: 'ครบกำหนดวันนี้', color: 'warning' };
    case 'NOT_DUE': return { label: 'ยังไม่ถึงกำหนด', color: 'default' };
    case 'NO_DUE_DATE': return { label: 'ไม่มีกำหนดชำระ', color: 'default' };
    case 'PAID': return { label: 'ชำระครบ', color: 'success' };
    default: return null;
  }
}
