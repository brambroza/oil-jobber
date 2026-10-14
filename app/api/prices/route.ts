import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';

/** Max ids per `.in()` filter to keep PostgREST GET URLs within length limits. */
const ID_CHUNK_SIZE = 200;

/** PostgREST caps each response at 1000 rows (max-rows), so page within each chunk. */
const PAGE_SIZE = 1000;

/**
 * Counts non-deleted oil_price_items per oil_base_price_id in a few bulk
 * queries instead of one count query per price round (N+1). Each chunk is
 * paged with `.range()` so the PostgREST row cap does not silently truncate counts.
 *
 * @param companyId - tenant scope
 * @param basePriceIds - price round ids to count items for
 * @returns map of oil_base_price_id to item count, or an error message
 */
async function countItemsByBasePrice(
  companyId: string,
  basePriceIds: string[],
): Promise<{ counts: Map<string, number>; error?: string }> {
  const counts = new Map<string, number>();
  for (let i = 0; i < basePriceIds.length; i += ID_CHUNK_SIZE) {
    const chunk = basePriceIds.slice(i, i + ID_CHUNK_SIZE);
    for (let offset = 0; ; offset += PAGE_SIZE) {
      const { data, error } = await supabaseAdmin
        .from('oil_price_items')
        .select('oil_base_price_id')
        .eq('company_id', companyId)
        .eq('is_deleted', false)
        .in('oil_base_price_id', chunk)
        .order('id')
        .range(offset, offset + PAGE_SIZE - 1);
      if (error) return { counts, error: error.message };
      const page = data ?? [];
      for (const item of page) {
        const key = String(item.oil_base_price_id);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
      if (page.length < PAGE_SIZE) break;
    }
  }
  return { counts };
}

export async function GET(req: NextRequest) {
  const guard = await requireStaff();
  if (guard.response) return guard.response;
  const companyId = guard.ctx.companyId;
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
  const { counts, error: countError } = await countItemsByBasePrice(
    companyId,
    rows.map((row) => String(row.id)),
  );
  if (countError) return NextResponse.json({ error: countError }, { status: 400 });

  return NextResponse.json(
    rows.map((r: any) => ({
      ...r,
      refinery_name: r.refineries?.name ?? '-',
      item_count: counts.get(String(r.id)) ?? 0,
    })),
  );
}
