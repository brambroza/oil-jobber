import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function GET(req: NextRequest) {
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });
  const { data: customers, error } = await supabaseAdmin
    .from('customers')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const paymentIds = [...new Set((customers ?? []).map((x) => x.payment_condition_id).filter(Boolean))] as string[];
  let paymentMap = new Map<string, { name?: string; code?: string }>();

  if (paymentIds.length) {
    const { data: paymentRows, error: paymentErr } = await supabaseAdmin
      .from('payment_conditions')
      .select('id, name, code')
      .in('id', paymentIds)
      .eq('company_id', companyId)
      .eq('is_deleted', false);
    if (paymentErr) return NextResponse.json({ error: paymentErr.message }, { status: 400 });
    paymentMap = new Map((paymentRows ?? []).map((p) => [p.id, { name: p.name, code: p.code }]));
  }

  const rows = (customers ?? []).map((c) => ({
    ...c,
    payment_conditions: c.payment_condition_id ? paymentMap.get(c.payment_condition_id) ?? null : null,
  }));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const companyId = resolveCompanyId(body.company_id);
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });
  const { data, error } = await supabaseAdmin.from('customers').insert({ ...body, company_id: companyId }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
