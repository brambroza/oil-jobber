import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { supabaseAdmin } from '@/lib/supabase/server';

async function resolveContext() {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { error: 'กรุณาเข้าสู่ระบบลูกค้า', status: 401 } as const;

  const { data: portalUser, error: portalError } = await supabaseAdmin
    .from('customer_portal_users')
    .select('id, auth_user_id, customer_id, company_id, display_name, avatar_url, is_active')
    .eq('auth_user_id', authData.user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (portalError) return { error: portalError.message, status: 400 } as const;
  if (!portalUser) return { error: 'บัญชีนี้ยังไม่ได้รับสิทธิ์พอร์ทัลลูกค้า', status: 403 } as const;

  const { data: customer } = await supabaseAdmin
    .from('customers')
    .select('company_name')
    .eq('id', portalUser.customer_id)
    .eq('company_id', portalUser.company_id)
    .maybeSingle();

  return {
    authUser: authData.user,
    portalUser,
    customerName: customer?.company_name ?? null,
  } as const;
}

export async function GET() {
  const ctx = await resolveContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  return NextResponse.json({
    email: ctx.authUser.email ?? '',
    customer_name: ctx.customerName,
    display_name: ctx.portalUser.display_name ?? '',
    avatar_url: ctx.portalUser.avatar_url ?? '',
  });
}

export async function PATCH(req: NextRequest) {
  const ctx = await resolveContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json();
  const displayName = String(body.display_name ?? '').trim();
  const avatarUrl = String(body.avatar_url ?? '').trim();

  const { error } = await supabaseAdmin
    .from('customer_portal_users')
    .update({ display_name: displayName || null, avatar_url: avatarUrl || null })
    .eq('id', ctx.portalUser.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
