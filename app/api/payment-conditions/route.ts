import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const guard = await requireStaff();
  if (guard.response) return guard.response;
  const companyId = guard.ctx.companyId;
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });
  const { data, error } = await supabaseAdmin
    .from('payment_conditions')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const guard = await requireStaff('settings');
  if (guard.response) return guard.response;
  const body = await req.json();
  const companyId = guard.ctx.companyId;
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });

  const payload = {
    company_id: companyId,
    code: String(body.code ?? '').trim().toUpperCase(),
    name: String(body.name ?? '').trim(),
    payment_type: String(body.payment_type ?? 'CASH').toUpperCase(),
    credit_days: Number(body.credit_days ?? 0),
    extra_cost_per_liter: Number(body.extra_cost_per_liter ?? 0),
  };

  const { data, error } = await supabaseAdmin.from('payment_conditions').insert(payload).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
