/**
 * Rules for the issue date (วันที่ออกใบกำกับภาษี) staff may set on a tax
 * invoice. Client-safe (no server imports) so the invoices page can reuse it.
 *
 * - must be a real `YYYY-MM-DD` date
 * - not in the future (Asia/Bangkok)
 * - same Gregorian year as the invoice number (IV-YY#### runs per year, so a
 *   date in another year would not match its number)
 * - the due date, when set, must not be before the issue date
 */

/**
 * Validates a tax invoice issue date.
 *
 * @param issuedAt - new issue date `YYYY-MM-DD`
 * @param context - today's date (Asia/Bangkok), the invoice number when it is
 *   already assigned, and the due date that will apply after the change
 * @returns Thai error message, or null when the date is allowed
 */
export function validateInvoiceIssueDate(
  issuedAt: string,
  context: { today: string; invoiceNo?: string | null; dueDate?: string | null },
): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(issuedAt) || Number.isNaN(Date.parse(`${issuedAt}T00:00:00Z`))) {
    return 'วันที่ออกใบกำกับภาษีไม่ถูกต้อง';
  }
  if (new Date(`${issuedAt}T00:00:00Z`).toISOString().slice(0, 10) !== issuedAt) {
    return 'วันที่ออกใบกำกับภาษีไม่ถูกต้อง';
  }
  if (issuedAt > context.today) return 'วันที่ออกใบกำกับภาษีต้องไม่เกินวันนี้';

  const numberYear = invoiceNumberYear(context.invoiceNo);
  const expectedYear = numberYear ?? context.today.slice(2, 4);
  if (issuedAt.slice(2, 4) !== expectedYear) {
    return numberYear
      ? `วันที่ออกต้องอยู่ในปี 20${numberYear} ตามเลขใบกำกับ ${context.invoiceNo}`
      : `วันที่ออกต้องอยู่ในปี 20${expectedYear} (เลขใบกำกับรันตามปี)`;
  }
  if (context.dueDate && context.dueDate < issuedAt) return 'วันครบกำหนดต้องไม่ก่อนวันที่ออกใบกำกับภาษี';
  return null;
}

/**
 * Two-digit Gregorian year encoded in an invoice number (`IV-YY####` or the
 * older `IV-YYMMDD####`), or null when the number has another shape.
 * @param invoiceNo - invoice number
 */
export function invoiceNumberYear(invoiceNo?: string | null): string | null {
  const match = /^IV-(\d{2})\d+$/.exec(String(invoiceNo || ''));
  return match ? match[1] : null;
}
