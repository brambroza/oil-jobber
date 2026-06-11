import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';
import { buildLineNewsFlex, sendLineNewsBroadcast } from '@/lib/services/line-news';

function toRecipientRows(companyId: string, newsId: string, recipientIds: string[]) {
  return [...new Set(recipientIds.filter(Boolean))].map((lineCustomerId) => ({
    company_id: companyId,
    line_news_broadcast_id: newsId,
    line_customer_id: lineCustomerId,
  }));
}

export async function GET(req: NextRequest) {
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { data: broadcasts, error } = await supabaseAdmin
    .from('line_news_broadcasts')
    .select('id, seq, title, descriptions, sent_at, status, created_at, updated_at')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('seq', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const ids = (broadcasts ?? []).map((item) => item.id);
  const recipientMap: Record<string, { total: number; sent: number; failed: number; recipientIds: string[] }> = {};

  if (ids.length) {
    const { data: recipients, error: recipientError } = await supabaseAdmin
      .from('line_news_broadcast_recipients')
      .select('line_news_broadcast_id, line_customer_id, sent_at, error_message')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .in('line_news_broadcast_id', ids);

    if (recipientError) return NextResponse.json({ error: recipientError.message }, { status: 400 });

    for (const recipient of recipients ?? []) {
      const key = String(recipient.line_news_broadcast_id || '');
      if (!recipientMap[key]) recipientMap[key] = { total: 0, sent: 0, failed: 0, recipientIds: [] };
      recipientMap[key].total += 1;
      if (recipient.sent_at) recipientMap[key].sent += 1;
      if (recipient.error_message) recipientMap[key].failed += 1;
      if (recipient.line_customer_id) recipientMap[key].recipientIds.push(String(recipient.line_customer_id));
    }
  }

  return NextResponse.json(
    (broadcasts ?? []).map((item) => ({
      ...item,
      recipient_count: recipientMap[item.id]?.total ?? 0,
      sent_count: recipientMap[item.id]?.sent ?? 0,
      failed_count: recipientMap[item.id]?.failed ?? 0,
      recipient_ids: recipientMap[item.id]?.recipientIds ?? [],
    })),
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const companyId = resolveCompanyId(body.company_id);
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const seq = Number(body.seq || 0);
  const title = String(body.title || '').trim();
  const descriptions = String(body.descriptions || '').trim();
  const recipientIds = Array.isArray(body.recipient_ids) ? body.recipient_ids.map((id: unknown) => String(id)) : [];
  const action = String(body.action || 'DRAFT');

  if (!seq) return NextResponse.json({ error: 'กรุณาระบุ seq' }, { status: 422 });
  if (!title) return NextResponse.json({ error: 'กรุณาระบุหัวข้อข่าวสาร' }, { status: 422 });
  if (!descriptions) return NextResponse.json({ error: 'กรุณาระบุรายละเอียดข่าวสาร' }, { status: 422 });
  if (action === 'SEND_NOW' && !recipientIds.length) {
    return NextResponse.json({ error: 'กรุณาเลือกผู้รับอย่างน้อย 1 รายการ' }, { status: 422 });
  }

  const nextStatus = action === 'SEND_NOW' ? 'SENDING' : 'DRAFT';
  const { data: news, error } = await supabaseAdmin
    .from('line_news_broadcasts')
    .insert({
      company_id: companyId,
      seq,
      title,
      descriptions,
      status: nextStatus,
      flex_payload: buildLineNewsFlex({ seq, title, descriptions }),
    })
    .select('id, seq, title, descriptions, sent_at, status, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const recipientRows = toRecipientRows(companyId, news.id, recipientIds);
  if (recipientRows.length) {
    const { error: recipientError } = await supabaseAdmin.from('line_news_broadcast_recipients').insert(recipientRows);
    if (recipientError) return NextResponse.json({ error: recipientError.message }, { status: 400 });
  }

  if (action === 'SEND_NOW') {
    const result = await sendLineNewsBroadcast(news.id);
    return NextResponse.json({ broadcast: { ...news, status: result.ok ? 'SENT' : 'PARTIAL' }, send_result: result }, { status: result.ok ? 200 : 207 });
  }

  return NextResponse.json({ broadcast: news });
}
