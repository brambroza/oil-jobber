import { supabaseAdmin } from '@/lib/supabase/server';
import { loadOrderDocumentData } from '@/lib/documents/from-order';
import type { CustomerInfo, DocumentItem, DocumentTotals, OrderDocumentData, QuotationDocumentData } from '@/lib/documents/types';

/** Active (non-cancelled) quotation row of a sale order. */
export type QuotationRow = {
  id: string;
  sale_order_id: string;
  quotation_no: string;
  issued_at: string;
  valid_until: string | null;
  note: string | null;
  status: string;
  customer_name: string | null;
  customer_tax_id: string | null;
  customer_address: string | null;
  customer_phone: string | null;
  items_snapshot: DocumentItem[] | null;
  totals_snapshot: DocumentTotals | Record<string, never> | null;
  total_amount: number | string | null;
};

const QUOTATION_COLUMNS =
  'id, sale_order_id, quotation_no, issued_at, valid_until, note, status, customer_name, customer_tax_id, customer_address, customer_phone, items_snapshot, totals_snapshot, total_amount';

/**
 * Today's date in Asia/Bangkok as `YYYY-MM-DD`.
 *
 * @param now - clock (injectable for tests)
 */
export function todayBangkok(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/**
 * Columns to insert for a new quotation: customer, items and totals snapshot
 * of the order as printed right now.
 *
 * @param doc - order document data
 * @returns snapshot columns
 */
export function buildQuotationSnapshot(doc: OrderDocumentData) {
  return {
    customer_name: doc.customer.name,
    customer_tax_id: doc.customer.tax_id,
    customer_address: doc.customer.address,
    customer_phone: doc.customer.phone,
    items_snapshot: doc.items,
    totals_snapshot: doc.totals,
    total_amount: doc.totals.net_incl_vat,
  };
}

/**
 * Merges a stored quotation into the current order document data so the PDF
 * prints the snapshot (customer, items, totals) instead of the live order.
 *
 * @param doc - current order document data (seller, salesperson, etc.)
 * @param row - stored quotation
 * @returns data for the quotation PDF
 */
export function applyQuotationSnapshot(doc: OrderDocumentData, row: QuotationRow): QuotationDocumentData {
  const items = Array.isArray(row.items_snapshot) && row.items_snapshot.length ? row.items_snapshot : doc.items;
  const totals = row.totals_snapshot && 'net_incl_vat' in row.totals_snapshot ? (row.totals_snapshot as DocumentTotals) : doc.totals;
  const customer: CustomerInfo = {
    name: row.customer_name || doc.customer.name,
    tax_id: row.customer_tax_id ?? doc.customer.tax_id,
    address: row.customer_address ?? doc.customer.address,
    phone: row.customer_phone ?? doc.customer.phone,
  };
  return {
    ...doc,
    customer,
    items,
    totals,
    quotation: {
      quotation_no: row.quotation_no,
      issued_at: row.issued_at,
      valid_until: row.valid_until,
      note: row.note,
    },
  };
}

/**
 * Loads the active quotation of an order, if any.
 *
 * @param companyId - tenant scope
 * @param orderId - sale order id
 */
export async function loadActiveQuotation(companyId: string, orderId: string): Promise<{ quotation: QuotationRow | null } | { error: string }> {
  const { data, error } = await supabaseAdmin
    .from('quotations')
    .select(QUOTATION_COLUMNS)
    .eq('company_id', companyId)
    .eq('sale_order_id', orderId)
    .eq('is_deleted', false)
    .neq('status', 'CANCELLED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message };
  return { quotation: (data as QuotationRow | null) ?? null };
}

/**
 * Loads the quotation PDF data for an order (latest active quotation).
 *
 * @param companyId - tenant scope
 * @param orderId - sale order id
 */
export async function loadQuotationDocumentData(companyId: string, orderId: string): Promise<QuotationDocumentData | { error: string; status: number }> {
  const doc = await loadOrderDocumentData(companyId, orderId);
  if ('error' in doc) return doc;
  const active = await loadActiveQuotation(companyId, orderId);
  if ('error' in active) return { error: active.error, status: 400 };
  if (!active.quotation) return { error: 'ยังไม่ได้ออกใบเสนอราคาสำหรับใบสั่งขายนี้', status: 409 };
  return applyQuotationSnapshot(doc, active.quotation);
}

/**
 * Issues a quotation (QT-YYMMDD####, numbered by DB trigger) from an order.
 * One active quotation per order; with `reissue` the current one is cancelled
 * first so prices can be re-quoted.
 *
 * @param companyId - tenant scope
 * @param userId - issuing staff user
 * @param orderId - sale order id
 * @param input - validity date, note and reissue flag
 */
export async function issueQuotation(
  companyId: string,
  userId: string,
  orderId: string,
  input: { valid_until?: string | null; note?: string | null; reissue: boolean },
): Promise<{ quotation: QuotationRow } | { error: string; status: number; quotation?: QuotationRow }> {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('sale_orders')
    .select('id, customer_id, order_status')
    .eq('id', orderId)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (orderError) return { error: orderError.message, status: 400 };
  if (!order) return { error: 'ไม่พบใบสั่งขาย', status: 404 };
  if (order.order_status === 'CANCELLED') return { error: 'ใบสั่งขายถูกยกเลิกแล้ว ออกใบเสนอราคาไม่ได้', status: 422 };

  const issuedAt = todayBangkok();
  if (input.valid_until && input.valid_until < issuedAt) {
    return { error: 'วันที่ยืนราคาต้องไม่ก่อนวันที่ออกเอกสาร', status: 422 };
  }

  const active = await loadActiveQuotation(companyId, orderId);
  if ('error' in active) return { error: active.error, status: 400 };
  if (active.quotation && !input.reissue) {
    return { error: `ใบสั่งขายนี้มีใบเสนอราคา ${active.quotation.quotation_no} อยู่แล้ว`, status: 409, quotation: active.quotation };
  }

  const doc = await loadOrderDocumentData(companyId, orderId);
  if ('error' in doc) return doc;
  if (!doc.items.length) return { error: 'ใบสั่งขายไม่มีรายการสินค้า', status: 422 };

  if (active.quotation) {
    const { error: cancelError } = await supabaseAdmin
      .from('quotations')
      .update({ status: 'CANCELLED', updated_by: userId, updated_at: new Date().toISOString() })
      .eq('id', active.quotation.id)
      .eq('company_id', companyId);
    if (cancelError) return { error: cancelError.message, status: 400 };
  }

  const { data, error } = await supabaseAdmin
    .from('quotations')
    .insert({
      company_id: companyId,
      sale_order_id: orderId,
      customer_id: order.customer_id,
      issued_at: issuedAt,
      valid_until: input.valid_until ?? null,
      note: input.note ?? null,
      status: 'ISSUED',
      ...buildQuotationSnapshot(doc),
      issued_by: userId,
      created_by: userId,
      updated_by: userId,
    })
    .select(QUOTATION_COLUMNS)
    .single();
  if (error) return { error: error.message, status: 400 };
  return { quotation: data as QuotationRow };
}
