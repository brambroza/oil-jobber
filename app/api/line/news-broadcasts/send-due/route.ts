import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';
import { sendLineNewsBroadcast } from '@/lib/services/line-news';

async function sendDue(companyIdInput?: unknown) {
  const companyId = resolveCompanyId(companyIdInput);
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { data: rows, error } = await supabaseAdmin
    .from('line_news_broadcasts')
    .select('id')
    .eq('company_id', companyId)
    .eq('status', 'SCHEDULED')
    .eq('is_deleted', false)
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const results = [];
  for (const row of rows ?? []) {
    try {
      results.push({ id: row.id, ...(await sendLineNewsBroadcast(row.id)) });
    } catch (e) {
      results.push({ id: row.id, ok: false, error: (e as Error).message });
    }
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}

export async function GET(req: NextRequest) {
  return sendDue(req.nextUrl.searchParams.get('company_id'));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return sendDue(body.company_id);
}
