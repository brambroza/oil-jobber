import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function GET(req: NextRequest) {
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('oil_base_prices')
    .select('id, company_id, effective_date, effective_at, expires_date, expires_at, confirmed, refinery_id, remark, refineries(name)')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('effective_at', { ascending: false, nullsFirst: false })
    .order('effective_date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = data ?? [];
  const counts = await Promise.all(
    rows.map(async (row) => {
      const { count, error: countError } = await supabaseAdmin
        .from('oil_price_items')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('oil_base_price_id', row.id)
        .eq('is_deleted', false);
      return { id: row.id, count: count ?? 0, error: countError };
    }),
  );
  const countError = counts.find((result) => result.error)?.error;
  if (countError) return NextResponse.json({ error: countError.message }, { status: 400 });
  const countMap = Object.fromEntries(counts.map((result) => [result.id, result.count]));


  return NextResponse.json(
    rows.map((r: any) => ({
      ...r,
      refinery_name: r.refineries?.name ?? '-',
      item_count: countMap[r.id] ?? 0,
    })),
  );
}
