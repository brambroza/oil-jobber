/**
 * Quotation-first workflow status helpers (client-safe, no server imports).
 *
 * A quotation made from the ใบเสนอราคา menu is a DRAFT sale order with
 * `quotation_stage`:
 * - `PENDING`   quotation only, not yet an order
 * - `CONVERTED` customer accepted, converted to a sale order
 * - `CLOSED`    customer rejected or quotation cancelled
 */
export type QuotationStage = 'PENDING' | 'CONVERTED' | 'CLOSED';

/** Stored status of a quotation document (`quotations.status`). */
export type QuotationDocStatus = 'ISSUED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

/** Status shown in the quotations menu. */
export type QuotationDisplayStatus = 'NOT_ISSUED' | 'WAITING' | 'EXPIRED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';

/** Customer decision actions on a pending quotation. */
export const QUOTATION_DECISIONS = ['convert', 'reject', 'cancel'] as const;
export type QuotationDecision = (typeof QUOTATION_DECISIONS)[number];

export const QUOTATION_STATUS_LABELS: Record<QuotationDisplayStatus, string> = {
  NOT_ISSUED: 'ยังไม่ออกเลข',
  WAITING: 'รอลูกค้าตอบ',
  EXPIRED: 'หมดอายุ',
  ACCEPTED: 'อนุมัติแล้ว (เป็นใบสั่งขาย)',
  REJECTED: 'ลูกค้าปฏิเสธ',
  CANCELLED: 'ยกเลิก',
};

export const QUOTATION_STATUS_COLORS: Record<QuotationDisplayStatus, 'default' | 'info' | 'warning' | 'success' | 'error'> = {
  NOT_ISSUED: 'default',
  WAITING: 'info',
  EXPIRED: 'warning',
  ACCEPTED: 'success',
  REJECTED: 'error',
  CANCELLED: 'default',
};

/**
 * True when a quotation's validity date has passed.
 *
 * @param validUntil - `YYYY-MM-DD` or null (no expiry)
 * @param today - today's date `YYYY-MM-DD` (Asia/Bangkok)
 */
export function isQuotationExpired(validUntil: string | null | undefined, today: string): boolean {
  return Boolean(validUntil) && String(validUntil) < today;
}

/**
 * Status to show in the quotations menu for one quotation-first order.
 *
 * @param stage - `sale_orders.quotation_stage`
 * @param quotation - latest quotation of the order (null when none issued yet)
 * @param today - today's date `YYYY-MM-DD` (Asia/Bangkok)
 */
export function quotationDisplayStatus(
  stage: QuotationStage | string | null | undefined,
  quotation: { status: QuotationDocStatus | string; valid_until: string | null } | null | undefined,
  today: string,
): QuotationDisplayStatus {
  if (stage === 'CONVERTED') return 'ACCEPTED';
  if (stage === 'CLOSED') return quotation?.status === 'REJECTED' ? 'REJECTED' : 'CANCELLED';
  if (!quotation || quotation.status !== 'ISSUED') return 'NOT_ISSUED';
  return isQuotationExpired(quotation.valid_until, today) ? 'EXPIRED' : 'WAITING';
}
