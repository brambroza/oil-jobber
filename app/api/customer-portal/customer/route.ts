import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { supabaseAdmin } from '@/lib/supabase/server';

async function resolveContext() {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { error: 'กรุณาเข้าสู่ระบบลูกค้า', status: 401 } as const;

  const { data: portalUser, error: portalError } = await supabaseAdmin
    .from('customer_portal_users')
    .select('id, auth_user_id, customer_id, company_id, is_active')
    .eq('auth_user_id', authData.user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (portalError) return { error: portalError.message, status: 400 } as const;
  if (!portalUser) return { error: 'บัญชีนี้ยังไม่ได้รับสิทธิ์พอร์ทัลลูกค้า', status: 403 } as const;

  return {
    authUserId: authData.user.id,
    portalUserId: portalUser.id,
    customerId: portalUser.customer_id,
    companyId: portalUser.company_id,
  } as const;
}

export async function GET() {
  const ctx = await resolveContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id, company_name, tax_id, address, phone, credit_limit, status')
    .eq('id', ctx.customerId)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest) {
  const ctx = await resolveContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json();
  const companyName = String(body.company_name ?? '').trim();
  if (!companyName) return NextResponse.json({ error: 'กรุณาระบุชื่อบริษัท' }, { status: 422 });

  const payload = {
    company_name: companyName,
    tax_id: String(body.tax_id ?? '').trim() || null,
    address: String(body.address ?? '').trim() || null,
    phone: String(body.phone ?? '').trim() || null,
  };

  const { data, error } = await supabaseAdmin
    .from('customers')
    .update(payload)
    .eq('id', ctx.customerId)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .select('id, company_name, tax_id, address, phone, credit_limit, status')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE() {
  const ctx = await resolveContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { error: customerErr } = await supabaseAdmin
    .from('customers')
    .update({ is_deleted: true })
    .eq('id', ctx.customerId)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false);

  if (customerErr) return NextResponse.json({ error: customerErr.message }, { status: 400 });

  const { error: portalErr } = await supabaseAdmin
    .from('customer_portal_users')
    .update({ is_active: false })
    .eq('id', ctx.portalUserId);

  if (portalErr) return NextResponse.json({ error: portalErr.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
