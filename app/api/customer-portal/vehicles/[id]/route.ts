import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { supabaseAdmin } from '@/lib/supabase/server';

async function resolvePortalContext() {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { error: 'กรุณาเข้าสู่ระบบลูกค้า', status: 401 } as const;

  const { data: portalUser, error: portalError } = await supabaseAdmin
    .from('customer_portal_users')
    .select('customer_id, company_id, is_active')
    .eq('auth_user_id', authData.user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (portalError) return { error: portalError.message, status: 400 } as const;
  if (!portalUser) return { error: 'บัญชีนี้ยังไม่ได้รับสิทธิ์พอร์ทัลลูกค้า', status: 403 } as const;

  return { customerId: portalUser.customer_id, companyId: portalUser.company_id } as const;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await resolvePortalContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json();
  const licensePlate = String(body.license_plate ?? '').trim();
  if (!licensePlate) return NextResponse.json({ error: 'กรุณาระบุทะเบียนรถ' }, { status: 422 });

  const payload = {
    license_plate: licensePlate,
    driver_name: String(body.driver_name ?? '').trim() || null,
    driver_phone: String(body.driver_phone ?? '').trim() || null,
    pickup_license_number: String(body.pickup_license_number ?? '').trim() || null,
  };

  const { data, error } = await supabaseAdmin
    .from('customer_vehicles')
    .update(payload)
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('customer_id', ctx.customerId)
    .eq('is_deleted', false)
    .select('id, license_plate, driver_name, driver_phone, pickup_license_number, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await resolvePortalContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { error } = await supabaseAdmin
    .from('customer_vehicles')
    .update({ is_deleted: true })
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('customer_id', ctx.customerId)
    .eq('is_deleted', false);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
