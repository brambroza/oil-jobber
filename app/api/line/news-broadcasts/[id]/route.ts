import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';
import { buildLineNewsFlex } from '@/lib/services/line-news';

function toRecipientRows(companyId: string, newsId: string, recipientIds: string[]) {
  return [...new Set(recipientIds.filter(Boolean))].map((lineCustomerId) => ({
    company_id: companyId,
    line_news_broadcast_id: newsId,
    line_customer_id: lineCustomerId,
  }));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const companyId = resolveCompanyId(body.company_id);
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const seq = Number(body.seq || 0);
  const title = String(body.title || '').trim();
  const descriptions = String(body.descriptions || '').trim();
  const imageUrls = Array.isArray(body.image_urls) ? body.image_urls.map((url: unknown) => String(url).trim()).filter(Boolean) : [];
  const recipientIds = Array.isArray(body.recipient_ids) ? body.recipient_ids.map((recipientId: unknown) => String(recipientId)) : [];

  if (!seq) return NextResponse.json({ error: 'กรุณาระบุ seq' }, { status: 422 });
  if (!title) return NextResponse.json({ error: 'กรุณาระบุหัวข้อข่าวสาร' }, { status: 422 });
  if (!descriptions) return NextResponse.json({ error: 'กรุณาระบุรายละเอียดข่าวสาร' }, { status: 422 });
  if (imageUrls.length > 4) return NextResponse.json({ error: 'แนบรูปภาพได้สูงสุด 4 รูปต่อข่าวสาร' }, { status: 422 });

  const { data: current, error: currentError } = await supabaseAdmin
    .from('line_news_broadcasts')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .single();

  if (currentError || !current) return NextResponse.json({ error: currentError?.message || 'ไม่พบข่าวสาร LINE' }, { status: 404 });

  const { data: news, error } = await supabaseAdmin
    .from('line_news_broadcasts')
    .update({
      seq,
      title,
      descriptions,
      image_urls: imageUrls,
      status: 'DRAFT',
      flex_payload: buildLineNewsFlex({ seq, title, descriptions, image_urls: imageUrls }),
    })
    .eq('id', id)
    .eq('company_id', companyId)
    .select('id, seq, title, descriptions, image_urls, sent_at, status, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: deleteRecipientsError } = await supabaseAdmin
    .from('line_news_broadcast_recipients')
    .update({ is_deleted: true })
    .eq('company_id', companyId)
    .eq('line_news_broadcast_id', id)
    .eq('is_deleted', false);

  if (deleteRecipientsError) return NextResponse.json({ error: deleteRecipientsError.message }, { status: 400 });

  const recipientRows = toRecipientRows(companyId, id, recipientIds);
  if (recipientRows.length) {
    const { error: recipientError } = await supabaseAdmin.from('line_news_broadcast_recipients').insert(recipientRows);
    if (recipientError) return NextResponse.json({ error: recipientError.message }, { status: 400 });
  }

  return NextResponse.json({ broadcast: news });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('line_news_broadcasts')
    .update({ is_deleted: true })
    .eq('id', id)
    .eq('company_id', companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await supabaseAdmin
    .from('line_news_broadcast_recipients')
    .update({ is_deleted: true })
    .eq('company_id', companyId)
    .eq('line_news_broadcast_id', id);

  return NextResponse.json({ ok: true });
}
