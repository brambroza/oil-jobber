import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/common';
import { customerBodySchema } from '@/lib/validation/customers';
import { loadSalesUserNames } from '@/lib/services/order-items';
import { isScopedRole } from '@/lib/services/customer-scope';
import { groupLineAccountsByCustomer } from '@/lib/utils/customer-list';

/** Lists customers with payment condition, default salesperson name and linked LINE accounts. */
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

  const customerRows = customers ?? [];
  const paymentIds = [...new Set(customerRows.map((x) => x.payment_condition_id).filter(Boolean))] as string[];

  let lineQuery = supabaseAdmin
    .from('line_customers')
    .select('id, customer_id, group_id, display_name, profile_image_url')
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .not('customer_id', 'is', null)
    .order('updated_at', { ascending: false });
  // SALES must not receive LINE accounts of customers outside their scope.
  if (isScopedRole(ctx.role)) lineQuery = lineQuery.in('customer_id', customerRows.map((c) => c.id));

  const [paymentRes, lineRes, salesNames] = await Promise.all([
    paymentIds.length
      ? supabaseAdmin
        .from('payment_conditions')
        .select('id, name, code')
        .in('id', paymentIds)
        .eq('company_id', ctx.companyId)
        .eq('is_deleted', false)
      : Promise.resolve({ data: [], error: null }),
    lineQuery,
    loadSalesUserNames(ctx.companyId, customerRows.map((c) => c.sales_user_id)),
  ]);
  if (paymentRes.error) return NextResponse.json({ error: paymentRes.error.message }, { status: 400 });
  if (lineRes.error) return NextResponse.json({ error: lineRes.error.message }, { status: 400 });

  const paymentMap = new Map<string, { name?: string; code?: string }>(
    (paymentRes.data ?? []).map((p) => [p.id, { name: p.name, code: p.code }]),
  );
  const lineAccounts = groupLineAccountsByCustomer(lineRes.data ?? []);

  const rows = customerRows.map((c) => ({
    ...c,
    payment_conditions: c.payment_condition_id ? paymentMap.get(c.payment_condition_id) ?? null : null,
    sales_user_name: c.sales_user_id ? salesNames.get(c.sales_user_id) ?? null : null,
    line_accounts: lineAccounts.get(c.id) ?? [],
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
