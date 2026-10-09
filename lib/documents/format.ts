/** Shared formatting helpers for printed documents (no React, no DOM). */

export function money(value: number, digits = 2): string {
  return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function liters(value: number): string {
  return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** `2026-10-07` or ISO timestamp → `07/10/2026` (Bangkok). */
export function dateTh(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value.length === 10 ? `${value}T00:00:00+07:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('th-TH-u-ca-gregory', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: 'เงินสด',
  TRANSFER: 'โอนเงิน',
  CHEQUE: 'เช็ค',
};

export function paymentMethodThai(method: string | null | undefined): string {
  return PAYMENT_METHOD_LABELS[String(method || '')] ?? String(method || '-');
}

export const RECEIVE_METHOD_LABELS: Record<string, string> = {
  DELIVER_BY_TRUCK: 'จัดส่งให้ทางรถ',
  PICKUP_BY_TRUCK: 'รับเองทางรถ',
  PICKUP_BY_BARGE: 'รับเองทางเรือ',
  ARRANGE_TRANSPORT: 'จัดหาขนส่งให้',
};

export function receiveMethodThai(method: string | null | undefined): string {
  return RECEIVE_METHOD_LABELS[String(method || '')] ?? String(method || '-');
}
