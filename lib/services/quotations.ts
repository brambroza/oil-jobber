import { supabaseAdmin } from '@/lib/supabase/server';
import { loadOrderDocumentData } from '@/lib/documents/from-order';
import type { CustomerInfo, DocumentItem, DocumentTotals, OrderDocumentData, QuotationDocumentData } from '@/lib/documents/types';
import { round2 } from '@/lib/services/order-pricing';
import { isQuotationExpired, type QuotationDecision } from '@/lib/utils/quotation-status';

/** Statuses that count as the order's current quotation (one at a time). */
const ACTIVE_QUOTATION_STATUSES = ['ISSUED', 'ACCEPTED'];
/** Statuses whose PDF can still be printed (everything but a cancelled / re-issued number). */
const PRINTABLE_QUOTATION_STATUSES = ['ISSUED', 'ACCEPTED', 'REJECTED'];

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
 * Snapshots taken before the refinery name was printed only carry the depot
 * (`LLK - ลำลูกกา`). Upgrade such a label to the live one
 * (`CALTEX · LLK - ลำลูกกา`) when the same line still points at the same depot;
 * a depot changed after issue keeps the snapshot label.
 *
 * @param snapshot - items stored on the quotation
 * @param live - current order items
 * @returns snapshot items with refinery-prefixed depot labels where safe
 */
export function withRefineryLabels(snapshot: DocumentItem[], live: DocumentItem[]): DocumentItem[] {
  return snapshot.map((it, index) => {
    const current = live[index];
    if (!current?.depot_label || current.product_code !== it.product_code) return it;
    const sameDepot = it.depot_label ? current.depot_label.endsWith(` · ${it.depot_label}`) : false;
    return sameDepot ? { ...it, depot_label: current.depot_label } : it;
  });
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
  const items = Array.isArray(row.items_snapshot) && row.items_snapshot.length
    ? withRefineryLabels(row.items_snapshot, doc.items)
    : doc.items;
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
 * Loads the newest quotation of an order whose status is one of `statuses`.
 *
 * @param companyId - tenant scope
 * @param orderId - sale order id
 * @param statuses - accepted quotation statuses
 */
async function loadLatestQuotation(companyId: string, orderId: string, statuses: string[]): Promise<{ quotation: QuotationRow | null } | { error: string }> {
  const { data, error } = await supabaseAdmin
    .from('quotations')
    .select(QUOTATION_COLUMNS)
    .eq('company_id', companyId)
    .eq('sale_order_id', orderId)
    .eq('is_deleted', false)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { error: error.message };
  return { quotation: (data as QuotationRow | null) ?? null };
}

/**
 * Loads the active (ISSUED / ACCEPTED) quotation of an order, if any.
 *
 * @param companyId - tenant scope
 * @param orderId - sale order id
 */
export async function loadActiveQuotation(companyId: string, orderId: string): Promise<{ quotation: QuotationRow | null } | { error: string }> {
  return loadLatestQuotation(companyId, orderId, ACTIVE_QUOTATION_STATUSES);
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
  const latest = await loadLatestQuotation(companyId, orderId, PRINTABLE_QUOTATION_STATUSES);
  if ('error' in latest) return { error: latest.error, status: 400 };
  if (!latest.quotation) return { error: 'ยังไม่ได้ออกใบเสนอราคาสำหรับใบสั่งขายนี้', status: 409 };
  return applyQuotationSnapshot(doc, latest.quotation);
}

/**
 * Issues a quotation (QT-YYMM####, numbered by DB trigger) from an order.
 * One active quotation per order; with `reissue` the current one is cancelled
 * first so prices can be re-quoted. With `only_if_changed` the current one is
 * kept (returned with `unchanged: true`) while its total still matches the
 * order and it has not expired; otherwise it is re-issued.
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
  input: { valid_until?: string | null; note?: string | null; reissue: boolean; only_if_changed?: boolean },
): Promise<{ quotation: QuotationRow; unchanged?: boolean } | { error: string; status: number; quotation?: QuotationRow }> {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('sale_orders')
    .select('id, customer_id, order_status, quotation_stage')
    .eq('id', orderId)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (orderError) return { error: orderError.message, status: 400 };
  if (!order) return { error: 'ไม่พบใบสั่งขาย', status: 404 };
  if (order.quotation_stage === 'CLOSED') return { error: 'ใบเสนอราคานี้ปิดแล้ว (ลูกค้าปฏิเสธ/ยกเลิก)', status: 422 };
  if (order.order_status === 'CANCELLED') return { error: 'ใบสั่งขายถูกยกเลิกแล้ว ออกใบเสนอราคาไม่ได้', status: 422 };

  const issuedAt = todayBangkok();
  if (input.valid_until && input.valid_until < issuedAt) {
    return { error: 'วันที่ยืนราคาต้องไม่ก่อนวันที่ออกเอกสาร', status: 422 };
  }

  const active = await loadActiveQuotation(companyId, orderId);
  if ('error' in active) return { error: active.error, status: 400 };
  if (active.quotation && !input.reissue && !input.only_if_changed) {
    return { error: `ใบสั่งขายนี้มีใบเสนอราคา ${active.quotation.quotation_no} อยู่แล้ว`, status: 409, quotation: active.quotation };
  }

  const doc = await loadOrderDocumentData(companyId, orderId);
  if ('error' in doc) return doc;
  if (!doc.items.length) return { error: 'ใบสั่งขายไม่มีรายการสินค้า', status: 422 };

  if (
    active.quotation
    && input.only_if_changed
    && !input.reissue
    && quotationMatchesOrder(active.quotation.total_amount, doc.totals.net_incl_vat)
    && !isQuotationExpired(active.quotation.valid_until, issuedAt)
  ) {
    return { quotation: active.quotation, unchanged: true };
  }

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

/** Latest printable quotation per order, for the quotations list. */
export type QuotationSummary = Pick<QuotationRow, 'id' | 'sale_order_id' | 'quotation_no' | 'issued_at' | 'valid_until' | 'status' | 'total_amount'>;

/**
 * Loads the newest non-cancelled quotation of each order.
 *
 * @param companyId - tenant scope
 * @param orderIds - sale order ids
 * @returns map of order id → quotation summary
 */
export async function loadLatestQuotationsByOrder(companyId: string, orderIds: string[]): Promise<Map<string, QuotationSummary> | { error: string }> {
  const result = new Map<string, QuotationSummary>();
  if (!orderIds.length) return result;
  const { data, error } = await supabaseAdmin
    .from('quotations')
    .select('id, sale_order_id, quotation_no, issued_at, valid_until, status, total_amount, created_at')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('sale_order_id', orderIds)
    .in('status', PRINTABLE_QUOTATION_STATUSES)
    .order('created_at', { ascending: false });
  if (error) return { error: error.message };
  for (const row of (data ?? []) as Array<QuotationSummary & { created_at: string }>) {
    if (!result.has(row.sale_order_id)) {
      const { created_at: _createdAt, ...summary } = row;
      result.set(row.sale_order_id, summary);
    }
  }
  return result;
}

/**
 * Decides whether a pending quotation's snapshot still matches the order:
 * converting must not silently change the price the customer accepted.
 *
 * @param quotedTotal - total stored on the quotation
 * @param currentTotal - current order total (incl. VAT)
 */
export function quotationMatchesOrder(quotedTotal: number | string | null, currentTotal: number): boolean {
  return Math.abs(round2(Number(quotedTotal || 0)) - round2(currentTotal)) < 0.005;
}

/**
 * Records the customer's answer on a quotation-first order (เมนูใบเสนอราคา):
 * - `convert` ลูกค้าอนุมัติ: quotation → ACCEPTED, order DRAFT → SUBMITTED
 *   (enters the normal approval flow). Refused when the quotation expired or
 *   the order was edited after the quotation was issued.
 * - `reject` ลูกค้าปฏิเสธ: quotation → REJECTED, order → CANCELLED
 * - `cancel` ยกเลิกใบเสนอราคา: quotation → CANCELLED, order → CANCELLED
 *
 * @param companyId - tenant scope
 * @param userId - staff recording the decision
 * @param orderId - quotation-first sale order id
 * @param action - decision
 * @param note - reason / remark (stored on the quotation)
 * @param today - today's date `YYYY-MM-DD` (injectable for tests)
 */
export async function decideQuotation(
  companyId: string,
  userId: string,
  orderId: string,
  action: QuotationDecision,
  note: string | null,
  today: string = todayBangkok(),
): Promise<{ order_id: string; order_no: string | null; order_status: string; quotation_no: string | null } | { error: string; status: number }> {
  const { data: order, error: orderError } = await supabaseAdmin
    .from('sale_orders')
    .select('id, order_no, order_status, quotation_stage')
    .eq('id', orderId)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (orderError) return { error: orderError.message, status: 400 };
  if (!order) return { error: 'ไม่พบใบเสนอราคา', status: 404 };
  if (order.quotation_stage !== 'PENDING') {
    const message = order.quotation_stage === 'CONVERTED'
      ? 'ใบเสนอราคานี้แปลงเป็นใบสั่งขายแล้ว'
      : order.quotation_stage === 'CLOSED'
        ? 'ใบเสนอราคานี้ปิดไปแล้ว'
        : 'รายการนี้เป็นใบสั่งขายปกติ ไม่ได้สร้างจากเมนูใบเสนอราคา';
    return { error: message, status: 409 };
  }

  const active = await loadActiveQuotation(companyId, orderId);
  if ('error' in active) return { error: active.error, status: 400 };
  const quotation = active.quotation;

  if (action === 'convert') {
    if (!quotation || quotation.status !== 'ISSUED') return { error: 'ยังไม่ได้ออกใบเสนอราคา กรุณาออกใบเสนอราคาก่อนแปลงเป็นใบสั่งขาย', status: 422 };
    if (isQuotationExpired(quotation.valid_until, today)) {
      return { error: `ใบเสนอราคา ${quotation.quotation_no} หมดอายุแล้ว กรุณาออกใบเสนอราคาใหม่ก่อนแปลงเป็นใบสั่งขาย`, status: 422 };
    }
    const doc = await loadOrderDocumentData(companyId, orderId);
    if ('error' in doc) return doc;
    if (!quotationMatchesOrder(quotation.total_amount, doc.totals.net_incl_vat)) {
      return { error: `ราคาในใบเสนอราคา ${quotation.quotation_no} ไม่ตรงกับข้อมูลปัจจุบัน (มีการแก้ไขหลังออกเลข) กรุณาออกใบเสนอราคาใหม่ก่อน`, status: 409 };
    }
  }

  const now = new Date().toISOString();
  const quotationStatus = action === 'convert' ? 'ACCEPTED' : action === 'reject' ? 'REJECTED' : 'CANCELLED';
  if (quotation) {
    const { error } = await supabaseAdmin
      .from('quotations')
      .update({ status: quotationStatus, decided_at: now, decided_by: userId, decision_note: note, updated_by: userId, updated_at: now })
      .eq('id', quotation.id)
      .eq('company_id', companyId);
    if (error) return { error: error.message, status: 400 };
  }

  const orderStatus = action === 'convert' ? 'SUBMITTED' : 'CANCELLED';
  const { error: updateError } = await supabaseAdmin
    .from('sale_orders')
    .update({
      quotation_stage: action === 'convert' ? 'CONVERTED' : 'CLOSED',
      order_status: orderStatus,
      ...(action === 'convert' ? { quotation_converted_at: now, quotation_converted_by: userId } : {}),
      updated_by: userId,
      updated_at: now,
    })
    .eq('id', orderId)
    .eq('company_id', companyId)
    .eq('quotation_stage', 'PENDING');
  if (updateError) {
    // Put the quotation back so the two rows stay consistent.
    if (quotation) {
      await supabaseAdmin
        .from('quotations')
        .update({ status: quotation.status, decided_at: null, decided_by: null, decision_note: null, updated_by: userId })
        .eq('id', quotation.id)
        .eq('company_id', companyId);
    }
    return { error: updateError.message, status: 400 };
  }

  await supabaseAdmin.from('sale_order_status_logs').insert({
    company_id: companyId,
    sale_order_id: orderId,
    from_status: order.order_status,
    to_status: orderStatus,
    note: action === 'convert'
      ? `ลูกค้าอนุมัติใบเสนอราคา${quotation ? ` ${quotation.quotation_no}` : ''} แปลงเป็นใบสั่งขาย`
      : `${action === 'reject' ? 'ลูกค้าปฏิเสธ' : 'ยกเลิก'}ใบเสนอราคา${quotation ? ` ${quotation.quotation_no}` : ''}${note ? `: ${note}` : ''}`,
    created_by: userId,
  });

  return { order_id: orderId, order_no: order.order_no ?? null, order_status: orderStatus, quotation_no: quotation?.quotation_no ?? null };
}
