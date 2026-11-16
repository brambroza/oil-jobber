import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseQuery } from '@/lib/validation/common';
import { paymentSlipListQuerySchema } from '@/lib/validation/accounting';
import { canAccessOrder, customerForbidden, filterByCustomerScope, loadCustomerScope } from '@/lib/services/customer-scope';
import { loadSalesUserNames } from '@/lib/services/order-items';

/**
 * Customer-uploaded slips. `?status=PENDING|APPROVED|REJECTED|ALL` (default PENDING),
 * optional `?sale_order_id=`. Includes order no, customer and outstanding balance.
 */
export async function GET(req: NextRequest) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const parsed = parseQuery(paymentSlipListQuerySchema, req.nextUrl.searchParams);
  if (parsed.response) return parsed.response;
  const { status, sale_order_id: orderId } = parsed.data;
  if (orderId && !(await canAccessOrder(ctx, orderId))) return customerForbidden();
  const scope = await loadCustomerScope(ctx);
  if (scope && 'error' in scope) return NextResponse.json({ error: scope.error }, { status: 400 });

  let query = supabaseAdmin
    .from('payment_slip_submissions')
    .select('id, sale_order_id, file_mime, amount, transferred_at, reference_no, payer_name, note, status, reviewed_by, reviewed_at, reject_reason, payment_transaction_id, created_at')
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (status !== 'ALL') query = query.eq('status', status);
  if (orderId) query = query.eq('sale_order_id', orderId);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = data ?? [];
  const orderIds = Array.from(new Set(rows.map((r) => r.sale_order_id)));
  const orders = new Map<string, { order_no: string | null; customer_id: string | null }>();
  const customerNames = new Map<string, string | null>();
  const outstanding = new Map<string, number>();
  if (orderIds.length) {
    const { data: orderRows } = await supabaseAdmin.from('sale_orders').select('id, order_no, customer_id').in('id', orderIds);
    for (const o of orderRows ?? []) orders.set(o.id, { order_no: o.order_no, customer_id: o.customer_id });
    const customerIds = Array.from(new Set((orderRows ?? []).map((o) => o.customer_id).filter(Boolean))) as string[];
    if (customerIds.length) {
      const { data: customers } = await supabaseAdmin.from('customers').select('id, company_name').in('id', customerIds);
      for (const c of customers ?? []) customerNames.set(c.id, c.company_name);
    }
    const balances = await Promise.all(orderIds.map(async (id) => {
      const { data: amount } = await supabaseAdmin.rpc('get_order_outstanding_amount', { p_order: id });
      return [id, Number(amount || 0)] as const;
    }));
    for (const [id, amount] of balances) outstanding.set(id, amount);
  }
  const reviewers = await loadSalesUserNames(ctx.companyId, rows.map((r) => r.reviewed_by));
  const visible = filterByCustomerScope(rows, scope, (r) => orders.get(r.sale_order_id)?.customer_id);

  return NextResponse.json(visible.map((r) => {
    const order = orders.get(r.sale_order_id);
    return {
      ...r,
      amount: Number(r.amount),
      order_no: order?.order_no ?? null,
      customer_name: order?.customer_id ? customerNames.get(order.customer_id) ?? null : null,
      outstanding: outstanding.get(r.sale_order_id) ?? 0,
      reviewed_by_name: r.reviewed_by ? reviewers.get(r.reviewed_by) ?? null : null,
    };
  }));
}
