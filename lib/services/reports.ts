import { supabaseAdmin } from '@/lib/supabase/server';
import { round2 } from '@/lib/services/order-pricing';
import { loadSalesUserNames } from '@/lib/services/order-items';

export type ReportOrderItem = { product_code: string; product_name: string; liters: number; unit_price: number; amount: number };

export type ReportOrderRow = {
  order_id: string;
  order_no: string | null;
  order_date: string;
  order_status: string;
  customer_id: string;
  customer_name: string;
  sales_user_id: string | null;
  sales_user_name: string | null;
  items: ReportOrderItem[];
  product_summary: string;
  total_liters: number;
  goods_amount: number;
  delivery_fee_amount: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
};

export type ReportSummary = {
  order_count: number;
  total_liters: number;
  goods_amount: number;
  delivery_fee_amount: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
};

/**
 * Loads non-cancelled, non-draft orders in a Bangkok-day range with items and
 * payments, optionally for one customer. `customerIds` narrows to the
 * caller's visible customers (SALES scope); `null` = all.
 */
export async function loadReportOrders(
  companyId: string,
  from: string,
  to: string,
  customerId?: string,
  customerIds?: string[] | null,
): Promise<ReportOrderRow[] | { error: string }> {
  if (Array.isArray(customerIds) && !customerIds.length) return [];
  let query = supabaseAdmin
    .from('sale_orders')
    .select('id, order_no, created_at, order_status, customer_id, sales_user_id, delivery_fee_amount, discount_amount, customers(company_name), sale_order_items(product_code, product_name, liters, unit_price, amount)')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .eq('sale_order_items.is_deleted', false)
    .not('order_status', 'in', '("CANCELLED","DRAFT")')
    .gte('created_at', `${from}T00:00:00+07:00`)
    .lt('created_at', `${to}T23:59:59.999+07:00`)
    .order('created_at', { ascending: false });
  if (customerId) query = query.eq('customer_id', customerId);
  if (Array.isArray(customerIds)) query = query.in('customer_id', customerIds);

  const { data: orders, error } = await query;
  if (error) return { error: error.message };
  const ids = (orders ?? []).map((o) => o.id);
  if (!ids.length) return [];

  const [paymentsRes, salesNames] = await Promise.all([
    supabaseAdmin.from('payment_transactions').select('sale_order_id, amount').eq('company_id', companyId).eq('is_deleted', false).in('sale_order_id', ids),
    loadSalesUserNames(companyId, (orders ?? []).map((o) => o.sales_user_id)),
  ]);
  if (paymentsRes.error) return { error: paymentsRes.error.message };
  const paidByOrder = new Map<string, number>();
  for (const p of paymentsRes.data ?? []) paidByOrder.set(p.sale_order_id, (paidByOrder.get(p.sale_order_id) || 0) + Number(p.amount || 0));

  return (orders ?? []).map((o: any) => {
    const items: ReportOrderItem[] = (o.sale_order_items ?? []).map((it: any) => ({
      product_code: String(it.product_code || ''),
      product_name: String(it.product_name || ''),
      liters: Number(it.liters || 0),
      unit_price: Number(it.unit_price || 0),
      amount: Number(it.amount || 0),
    }));
    const goods = round2(items.reduce((s, it) => s + it.amount, 0));
    const fee = Number(o.delivery_fee_amount || 0);
    const discount = Number(o.discount_amount || 0);
    const total = round2(Math.max(0, goods + fee - discount));
    const paid = round2(paidByOrder.get(o.id) || 0);
    return {
      order_id: o.id,
      order_no: o.order_no,
      order_date: o.created_at,
      order_status: String(o.order_status),
      customer_id: o.customer_id,
      customer_name: o.customers?.company_name || '-',
      sales_user_id: o.sales_user_id,
      sales_user_name: o.sales_user_id ? salesNames.get(o.sales_user_id) ?? null : null,
      items,
      product_summary: items.map((it) => `${it.product_code} (${it.liters.toLocaleString('th-TH')} L)`).join(', '),
      total_liters: items.reduce((s, it) => s + it.liters, 0),
      goods_amount: goods,
      delivery_fee_amount: fee,
      discount_amount: discount,
      total_amount: total,
      paid_amount: paid,
      outstanding_amount: round2(Math.max(0, total - paid)),
    };
  });
}

/** Sums the money columns of a set of rows. */
export function summarize(rows: ReportOrderRow[]): ReportSummary {
  return rows.reduce<ReportSummary>((acc, r) => ({
    order_count: acc.order_count + 1,
    total_liters: acc.total_liters + r.total_liters,
    goods_amount: round2(acc.goods_amount + r.goods_amount),
    delivery_fee_amount: round2(acc.delivery_fee_amount + r.delivery_fee_amount),
    discount_amount: round2(acc.discount_amount + r.discount_amount),
    total_amount: round2(acc.total_amount + r.total_amount),
    paid_amount: round2(acc.paid_amount + r.paid_amount),
    outstanding_amount: round2(acc.outstanding_amount + r.outstanding_amount),
  }), { order_count: 0, total_liters: 0, goods_amount: 0, delivery_fee_amount: 0, discount_amount: 0, total_amount: 0, paid_amount: 0, outstanding_amount: 0 });
}
