import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { filterByCustomerScope, loadCustomerScope } from '@/lib/services/customer-scope';

/** Lists invoices with the order number (manual join). */
export async function GET() {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const scope = await loadCustomerScope(guard.ctx);
  if (scope && 'error' in scope) return NextResponse.json({ error: scope.error }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('company_id', guard.ctx.companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const orderIds = Array.from(new Set((data ?? []).map((r) => r.sale_order_id)));
  const orderNo = new Map<string, string | null>();
  const orderCustomer = new Map<string, string | null>();
  if (orderIds.length) {
    const { data: orders } = await supabaseAdmin.from('sale_orders').select('id, order_no, customer_id').in('id', orderIds);
    for (const o of orders ?? []) {
      orderNo.set(o.id, o.order_no);
      orderCustomer.set(o.id, o.customer_id);
    }
  }
  const visible = filterByCustomerScope(data ?? [], scope, (r) => orderCustomer.get(r.sale_order_id));
  return NextResponse.json(visible.map((r) => ({ ...r, order_no: orderNo.get(r.sale_order_id) ?? null, total_amount: r.total_amount ?? r.amount })));
}
