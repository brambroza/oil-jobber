import { supabaseAdmin } from '@/lib/supabase/server';
import { round2 } from '@/lib/services/order-pricing';
import { loadSalesUserNames } from '@/lib/services/order-items';

export type OutstandingRow = {
  sale_order_id: string;
  order_no: string | null;
  customer_id: string;
  customer_name: string;
  sales_user_id: string | null;
  sales_user_name: string | null;
  order_status: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  invoice_no: string | null;
  invoice_id: string | null;
};

/**
 * Outstanding balances per order in two queries (orders + payments) instead of
 * one RPC per order. Cancelled/draft orders are excluded. `customerIds`
 * narrows the result to those customers (SALES scope); `null` = all.
 */
export async function loadOutstandingRows(
  companyId: string,
  options: { overdueOnly?: boolean; customerIds?: string[] | null } = {},
): Promise<OutstandingRow[] | { error: string }> {
  if (Array.isArray(options.customerIds) && !options.customerIds.length) return [];
  let query = supabaseAdmin
    .from('sale_orders')
    .select('id, order_no, customer_id, sales_user_id, order_status, due_date, delivery_fee_amount, discount_amount, created_at, customers(company_name), sale_order_items(amount)')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .eq('sale_order_items.is_deleted', false)
    .not('order_status', 'in', '("CANCELLED","DRAFT")')
    .order('created_at', { ascending: false });
  if (options.overdueOnly) query = query.lt('due_date', new Date().toISOString().slice(0, 10));
  if (Array.isArray(options.customerIds)) query = query.in('customer_id', options.customerIds);

  const { data: orders, error } = await query;
  if (error) return { error: error.message };
  const ids = (orders ?? []).map((o) => o.id);
  if (!ids.length) return [];

  const [paymentsRes, invoicesRes, salesNames] = await Promise.all([
    supabaseAdmin.from('payment_transactions').select('sale_order_id, amount').eq('company_id', companyId).eq('is_deleted', false).in('sale_order_id', ids),
    supabaseAdmin.from('invoices').select('id, sale_order_id, invoice_no').eq('company_id', companyId).eq('is_deleted', false).neq('status', 'CANCELLED').in('sale_order_id', ids),
    loadSalesUserNames(companyId, (orders ?? []).map((o) => o.sales_user_id)),
  ]);
  if (paymentsRes.error) return { error: paymentsRes.error.message };

  const paidByOrder = new Map<string, number>();
  for (const p of paymentsRes.data ?? []) paidByOrder.set(p.sale_order_id, (paidByOrder.get(p.sale_order_id) || 0) + Number(p.amount || 0));
  const invoiceByOrder = new Map<string, { id: string; invoice_no: string }>();
  for (const inv of invoicesRes.data ?? []) invoiceByOrder.set(inv.sale_order_id, { id: inv.id, invoice_no: inv.invoice_no });

  const rows: OutstandingRow[] = [];
  for (const o of orders ?? []) {
    const goods = ((o as any).sale_order_items ?? []).reduce((s: number, it: any) => s + Number(it.amount || 0), 0);
    const total = round2(Math.max(0, goods + Number(o.delivery_fee_amount || 0) - Number(o.discount_amount || 0)));
    const paid = round2(paidByOrder.get(o.id) || 0);
    const outstanding = round2(total - paid);
    if (outstanding <= 0) continue;
    rows.push({
      sale_order_id: o.id,
      order_no: o.order_no,
      customer_id: o.customer_id,
      customer_name: ((o as any).customers?.company_name as string) ?? '-',
      sales_user_id: o.sales_user_id,
      sales_user_name: o.sales_user_id ? salesNames.get(o.sales_user_id) ?? null : null,
      order_status: String(o.order_status),
      due_date: o.due_date,
      total_amount: total,
      paid_amount: paid,
      outstanding_amount: outstanding,
      invoice_no: invoiceByOrder.get(o.id)?.invoice_no ?? null,
      invoice_id: invoiceByOrder.get(o.id)?.id ?? null,
    });
  }
  return rows;
}
