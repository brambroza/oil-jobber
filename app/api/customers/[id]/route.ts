import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/common';
import { customerPatchSchema } from '@/lib/validation/customers';
import { loadSalesUserNames } from '@/lib/services/order-items';
import { canAccessCustomer, customerForbidden } from '@/lib/services/customer-scope';

/** Returns one customer with payment condition, default salesperson and credit status. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('customers');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;
  if (!(await canAccessCustomer(ctx, id))) return customerForbidden();

  const [customerRes, creditRes] = await Promise.all([
    supabaseAdmin
      .from('customers')
      .select('*')
      .eq('id', id)
      .eq('company_id', ctx.companyId)
      .eq('is_deleted', false)
      .maybeSingle(),
    supabaseAdmin.rpc('get_customer_credit_status', { p_customer: id }),
  ]);
  if (customerRes.error) return NextResponse.json({ error: customerRes.error.message }, { status: 400 });
  if (!customerRes.data) return NextResponse.json({ error: 'ไม่พบลูกค้า' }, { status: 404 });

  const customer = customerRes.data;
  const [paymentRes, salesNames] = await Promise.all([
    customer.payment_condition_id
      ? supabaseAdmin
        .from('payment_conditions')
        .select('id, code, name, payment_type, credit_days')
        .eq('id', customer.payment_condition_id)
        .maybeSingle()
      : Promise.resolve({ data: null }),
    loadSalesUserNames(ctx.companyId, [customer.sales_user_id]),
  ]);

  return NextResponse.json({
    ...customer,
    payment_conditions: paymentRes.data ?? null,
    sales_user_name: customer.sales_user_id ? salesNames.get(customer.sales_user_id) ?? null : null,
    credit: creditRes.error ? null : (creditRes.data ?? [])[0] ?? null,
  });
}

/** Partially updates a customer. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('customers');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;

  const parsed = parseBody(customerPatchSchema, await req.json());
  if (parsed.response) return parsed.response;
  if (!(await canAccessCustomer(ctx, id))) return customerForbidden();

  // SALES may add their own fee but never touch the admin baseline, credit limit or default salesperson.
  const update: Record<string, unknown> = { ...parsed.data };
  if (ctx.role === 'SALES') {
    delete update.price_adjustment_per_liter;
    delete update.credit_limit;
    delete update.sales_user_id;
  }
  // SALES_MANAGER assigns salespeople but the credit line and admin baseline stay admin-only.
  if (ctx.role === 'SALES_MANAGER') {
    delete update.price_adjustment_per_liter;
    delete update.credit_limit;
  }

  const { data, error } = await supabaseAdmin
    .from('customers')
    .update({ ...update, updated_by: ctx.userId })
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

/** Soft-deletes a customer. */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('customers');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;
  if (!(await canAccessCustomer(ctx, id))) return customerForbidden();

  const { error } = await supabaseAdmin
    .from('customers')
    .update({ is_deleted: true, updated_by: ctx.userId })
    .eq('id', id)
    .eq('company_id', ctx.companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
