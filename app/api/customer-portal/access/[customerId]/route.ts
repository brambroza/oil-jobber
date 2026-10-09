import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { canAccessCustomer, customerForbidden } from '@/lib/services/customer-scope';

function toUuidList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((x) => String(x || '').trim())
    .filter((x) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x));
}

function toTransportFeeMap(input: unknown): Record<string, number> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) continue;
    const fee = Number(value || 0);
    if (Number.isFinite(fee) && fee > 0) result[key] = fee;
  }
  return result;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const guard = await requireStaff('customers');
  if (guard.response) return guard.response;
  const { customerId } = await params;
  const companyId = guard.ctx.companyId;

  if (!companyId) return NextResponse.json({ error: 'กรุณาระบุ company_id' }, { status: 422 });
  if (!(await canAccessCustomer(guard.ctx, customerId))) return customerForbidden();

  const [accessRes, userRes, customerRes] = await Promise.all([
    supabaseAdmin
      .from('customer_portal_access')
      .select('*')
      .eq('customer_id', customerId)
      .eq('company_id', companyId)
      .maybeSingle(),
    supabaseAdmin
      .from('customer_portal_users')
      .select('id, auth_user_id, is_active')
      .eq('customer_id', customerId)
      .eq('company_id', companyId)
      .eq('is_active', true)
      .maybeSingle(),
    supabaseAdmin
      .from('customers')
      .select('price_adjustment_per_liter, sales_fee_per_liter')
      .eq('id', customerId)
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .maybeSingle(),
  ]);

  if (accessRes.error) return NextResponse.json({ error: accessRes.error.message }, { status: 400 });
  if (userRes.error) return NextResponse.json({ error: userRes.error.message }, { status: 400 });

  const portalUser = userRes.data ? { ...userRes.data, email: '' } : null;
  if (portalUser?.auth_user_id) {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.getUserById(portalUser.auth_user_id);
    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });
    portalUser.email = authData.user.email ?? '';
  }

  // Per-customer price adjustments (admin baseline + sales fee), used by the LINE price broadcast.
  const customerPricing = {
    price_adjustment_per_liter: Number(customerRes.data?.price_adjustment_per_liter || 0),
    sales_fee_per_liter: Number(customerRes.data?.sales_fee_per_liter || 0),
  };
  return NextResponse.json({ access: accessRes.data, portal_user: portalUser, customer_pricing: customerPricing });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ customerId: string }> }) {
  const guard = await requireStaff('customers');
  if (guard.response) return guard.response;
  const { customerId } = await params;
  const body = await req.json();
  const companyId = guard.ctx.companyId;

  if (!companyId) return NextResponse.json({ error: 'กรุณาระบุ company_id' }, { status: 422 });
  if (!(await canAccessCustomer(guard.ctx, customerId))) return customerForbidden();

  const payload = {
    customer_id: customerId,
    company_id: companyId,
    allowed_refinery_ids: toUuidList(body.allowed_refinery_ids),
    allowed_depot_ids: toUuidList(body.allowed_depot_ids),
    allowed_oil_product_ids: toUuidList(body.allowed_oil_product_ids),
    allowed_payment_condition_ids: toUuidList(body.allowed_payment_condition_ids),
    depot_transport_fees: toTransportFeeMap(body.depot_transport_fees),
    can_place_order: Boolean(body.can_place_order ?? true),
  };

  const { data, error } = await supabaseAdmin
    .from('customer_portal_access')
    .upsert(payload, { onConflict: 'customer_id' })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
