import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function GET(req: NextRequest) {
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const since = String(req.nextUrl.searchParams.get('since') ?? '').trim();

  let query = supabaseAdmin
    .from('sale_orders')
    .select('id, created_at, order_status, customers(company_name)')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(20);

  if (since) query = query.gt('created_at', since);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const items = (data ?? []).map((row: any) => ({
    id: row.id,
    created_at: row.created_at,
    order_status: row.order_status,
    customer_name: row.customers?.company_name ?? '-',
  }));

  return NextResponse.json({ unread_count: items.length, items });
}
