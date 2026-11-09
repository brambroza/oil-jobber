import { supabaseAdmin } from '@/lib/supabase/server';
import type { InvoiceContentRow } from '@/lib/utils/invoice-content';
import type { DocumentItem, DocumentTotals } from '@/lib/documents/types';

/** Invoice columns that hold editable (printed) content. */
export const INVOICE_CONTENT_COLUMNS =
  'content_overridden, customer_name, customer_tax_id, customer_address, customer_phone, note, items_snapshot, totals_snapshot';

/**
 * Loads the stored content of the order's active tax invoice. Returns null
 * when there is none or when the content columns are not migrated yet
 * (`20261109130000_invoice_content_override.sql`), so the PDF falls back to
 * the live order.
 *
 * @param companyId - tenant scope
 * @param orderId - sale order id
 */
export async function loadInvoiceContentRow(companyId: string, orderId: string): Promise<InvoiceContentRow | null> {
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select(INVOICE_CONTENT_COLUMNS)
    .eq('company_id', companyId)
    .eq('sale_order_id', orderId)
    .eq('is_deleted', false)
    .neq('status', 'CANCELLED')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as InvoiceContentRow;
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

