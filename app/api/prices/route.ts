import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function GET(req: NextRequest) {
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('oil_base_prices')
    .select('id, company_id, effective_date, effective_at, confirmed, refinery_id, refineries(name)')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('effective_at', { ascending: false, nullsFirst: false })
    .order('effective_date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = data ?? [];
  const ids = rows.map((r) => r.id);
  const countMap: Record<string, number> = {};

  if (ids.length) {
    const { data: items } = await supabaseAdmin
      .from('oil_price_items')
      .select('oil_base_price_id')
      .in('oil_base_price_id', ids)
      .eq('is_deleted', false);
    for (const it of items ?? []) {
      const key = String(it.oil_base_price_id);
      countMap[key] = (countMap[key] ?? 0) + 1;
    }
  }

  return NextResponse.json(
    rows.map((r: any) => ({
      ...r,
      refinery_name: r.refineries?.name ?? '-',
      item_count: countMap[r.id] ?? 0,
    })),
  );
}
