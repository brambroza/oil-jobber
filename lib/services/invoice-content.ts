import { supabaseAdmin } from '@/lib/supabase/server';
import type { InvoiceContentRow } from '@/lib/utils/invoice-content';
import type { DocumentItem, DocumentTotals } from '@/lib/documents/types';

/** Invoice columns that hold editable (printed) content. */
export const INVOICE_CONTENT_COLUMNS =
  'content_overridden, customer_name, customer_tax_id, customer_address, customer_phone, note, items_snapshot, totals_snapshot';

/** Stored invoice row used to print a tax invoice. */
export type InvoiceDocumentRow = InvoiceContentRow & {
  id: string;
  sale_order_id: string;
  invoice_no: string;
  issued_at: string;
  due_date: string | null;
  status: string;
  delivery_id: string | null;
};

const INVOICE_DOCUMENT_COLUMNS = `id, sale_order_id, invoice_no, issued_at, due_date, status, delivery_id, ${INVOICE_CONTENT_COLUMNS}`;

/**
 * Loads the tax invoice to print. `id` is an invoice id (one invoice per
 * delivery trip) or, for links made before trips existed, an order id: then
 * the order's latest active invoice is used. Returns null when there is none
 * or when the invoice columns are not migrated yet
 * (`20261109130000_invoice_content_override.sql`,
 * `20261123100000_delivery_trips_multi_invoice.sql`).
 *
 * @param companyId - tenant scope
 * @param id - invoice id or sale order id
 */
export async function loadInvoiceForDocument(companyId: string, id: string): Promise<InvoiceDocumentRow | null> {
  const find = async (columns: string) => {
    const byId = await supabaseAdmin
      .from('invoices')
      .select(columns)
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('is_deleted', false)
      .neq('status', 'CANCELLED')
      .maybeSingle();
    if (byId.data) return { row: byId.data as unknown as InvoiceDocumentRow, error: null };
    const byOrder = await supabaseAdmin
      .from('invoices')
      .select(columns)
      .eq('company_id', companyId)
      .eq('sale_order_id', id)
      .eq('is_deleted', false)
      .neq('status', 'CANCELLED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { row: (byOrder.data as unknown as InvoiceDocumentRow | null) ?? null, error: byOrder.error?.message ?? null };
  };
  const found = await find(INVOICE_DOCUMENT_COLUMNS);
  // ยังไม่ได้รัน migration เที่ยวส่งของ: อ่านแบบเดิม (ไม่มี delivery_id)
  if (!found.row && found.error && /delivery_id/.test(found.error)) {
    const legacy = await find(INVOICE_DOCUMENT_COLUMNS.replace(', delivery_id', ''));
    return legacy.row ? { ...legacy.row, delivery_id: null } : null;
  }
  return found.row;
}

/**
 * Invoice columns that mirror the printed content (customer, lines, totals).
 * @param content - printed customer, items and totals
 */
export function invoiceContentColumns(content: {
  customer: { name: string; tax_id: string | null; address: string | null; phone: string | null };
  items: DocumentItem[];
  totals: DocumentTotals;
  note: string | null;
}) {
  return {
    customer_name: content.customer.name,
    customer_tax_id: content.customer.tax_id,
    customer_address: content.customer.address,
    customer_phone: content.customer.phone,
    note: content.note,
    items_snapshot: content.items,
    totals_snapshot: content.totals,
    amount: content.totals.net_incl_vat,
    goods_amount: content.totals.goods_incl_vat,
    delivery_fee_amount: content.totals.delivery_fee_incl_vat,
    discount_amount: content.totals.discount_incl_vat,
    subtotal_amount: content.totals.subtotal_ex_vat,
    vat_amount: content.totals.vat,
    total_amount: content.totals.net_incl_vat,
  };
}

