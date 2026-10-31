import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const guard = await requireStaff();
  if (guard.response) return guard.response;
  const companyId = guard.ctx.companyId;
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('oil_base_prices')
    .select('id, company_id, effective_date, effective_at, expires_date, expires_at, confirmed, refinery_id, remark, refineries(name), oil_price_items(count)')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .eq('oil_price_items.is_deleted', false)
    .order('effective_at', { ascending: false, nullsFirst: false })
    .order('effective_date', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json(
    (data ?? []).map(({ oil_price_items: itemCounts, ...r }: any) => ({
      ...r,
      refinery_name: r.refineries?.name ?? '-',
      item_count: itemCounts?.[0]?.count ?? 0,
    })),
  );
}
