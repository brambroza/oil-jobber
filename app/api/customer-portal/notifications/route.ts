import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { supabaseAdmin } from '@/lib/supabase/server';

async function resolveContext() {
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

export async function GET() {
  const ctx = await resolveContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data, error } = await supabaseAdmin
    .from('customer_notifications')
    .select('id, title, message, category, source_role, is_read, created_at')
    .eq('company_id', ctx.companyId)
    .eq('customer_id', ctx.customerId)
    .order('created_at', { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const unread = (data ?? []).filter((x) => !x.is_read).length;
  return NextResponse.json({ notifications: data ?? [], unread_count: unread });
}

export async function PATCH(req: NextRequest) {
  const ctx = await resolveContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json();
  const id = String(body.id ?? '').trim();

  if (id) {
    const { error } = await supabaseAdmin
      .from('customer_notifications')
      .update({ is_read: true })
      .eq('id', id)
      .eq('company_id', ctx.companyId)
      .eq('customer_id', ctx.customerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  const { error } = await supabaseAdmin
    .from('customer_notifications')
    .update({ is_read: true })
    .eq('company_id', ctx.companyId)
    .eq('customer_id', ctx.customerId)
    .eq('is_read', false);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
