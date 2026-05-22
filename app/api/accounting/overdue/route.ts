import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function GET(req: NextRequest) {
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { data: orders, error } = await supabaseAdmin
    .from('sale_orders')
    .select('id, customer_id, due_date, customers(company_name)')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .lt('due_date', new Date().toISOString().slice(0, 10))
    .order('due_date', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const results: Array<{ sale_order_id: string; customer_id: string; customer_name: string; due_date: string | null; outstanding_amount: number }> = [];

  for (const o of orders ?? []) {
    const { data: outstanding, error: outErr } = await supabaseAdmin.rpc('get_order_outstanding_amount', { p_order: o.id });
    if (outErr) continue;
    const amount = Number(outstanding ?? 0);
    if (amount > 0) {
      results.push({
        sale_order_id: o.id,
        customer_id: o.customer_id,
        customer_name: ((o as any).customers?.company_name as string) ?? '-',
        due_date: o.due_date,
        outstanding_amount: amount,
      });
    }
  }

  return NextResponse.json(results);
}
