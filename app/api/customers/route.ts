import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/common';
import { customerBodySchema } from '@/lib/validation/customers';
import { loadSalesUserNames } from '@/lib/services/order-items';
import { isScopedRole } from '@/lib/services/customer-scope';

/** Lists customers with payment condition and default salesperson name. */
export async function GET() {
  const guard = await requireStaff('customers');
  if (guard.response) return guard.response;
  const { ctx } = guard;

  let query = supabaseAdmin
    .from('customers')
    .select('*')
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  // SALES only sees customers assigned to them as default salesperson.
  if (isScopedRole(ctx.role)) query = query.eq('sales_user_id', ctx.userId);

  const { data: customers, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const paymentIds = [...new Set((customers ?? []).map((x) => x.payment_condition_id).filter(Boolean))] as string[];
  let paymentMap = new Map<string, { name?: string; code?: string }>();

  if (paymentIds.length) {
    const { data: paymentRows, error: paymentErr } = await supabaseAdmin
      .from('payment_conditions')
      .select('id, name, code')
      .in('id', paymentIds)
      .eq('company_id', ctx.companyId)
      .eq('is_deleted', false);
    if (paymentErr) return NextResponse.json({ error: paymentErr.message }, { status: 400 });
    paymentMap = new Map((paymentRows ?? []).map((p) => [p.id, { name: p.name, code: p.code }]));
  }

  const salesNames = await loadSalesUserNames(ctx.companyId, (customers ?? []).map((c) => c.sales_user_id));

  const rows = (customers ?? []).map((c) => ({
    ...c,
    payment_conditions: c.payment_condition_id ? paymentMap.get(c.payment_condition_id) ?? null : null,
    sales_user_name: c.sales_user_id ? salesNames.get(c.sales_user_id) ?? null : null,
  }));

  return NextResponse.json(rows);
}

/** Creates a customer. */
export async function POST(req: NextRequest) {
  const guard = await requireStaff('customers');
  if (guard.response) return guard.response;
  const { ctx } = guard;

  const parsed = parseBody(customerBodySchema, await req.json());
  if (parsed.response) return parsed.response;

  // A customer created by SALES is assigned to that salesperson so they can see it afterwards.
  const payload = { ...parsed.data };
  if (isScopedRole(ctx.role)) {
    payload.sales_user_id = ctx.userId;
    payload.price_adjustment_per_liter = 0;
  }
  if (ctx.role === 'SALES_MANAGER') {
    payload.price_adjustment_per_liter = 0;
    payload.credit_limit = 0;
  }

  const { data, error } = await supabaseAdmin
    .from('customers')
    .insert({ ...payload, company_id: ctx.companyId, created_by: ctx.userId, updated_by: ctx.userId })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
