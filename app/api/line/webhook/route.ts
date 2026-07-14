import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';
import { getLineProfile } from '@/lib/services/line';

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id') || payload.company_id);
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });

  const events = payload.events ?? [];

  for (const ev of events) {
    const userId = String(ev?.source?.userId ?? '').trim();
    const sourceType = String(ev?.source?.type ?? '').trim();
    const groupId = sourceType === 'group' ? String(ev?.source?.groupId ?? '').trim() : '';
    if (!userId) continue;

    // LINE sends groupId only for group events. A stable key lets the same
    // person have separate direct and group conversations.
    const conversationKey = groupId || 'DIRECT';

    const profile = await getLineProfile(userId);

    const { data: lineCustomer, error: upsertError } = await supabaseAdmin
      .from('line_customers')
      .upsert(
        {
          company_id: companyId,
          line_user_id: userId,
          group_id: groupId || null,
          conversation_key: conversationKey,
          display_name: profile?.displayName ?? null,
          profile_image_url: profile?.pictureUrl ?? null,
        },
        { onConflict: 'company_id,line_user_id,conversation_key' },
      )
      .select('id')
      .single();

    if (upsertError || !lineCustomer?.id) continue;

    if (ev.type === 'message' && ev.message?.type === 'text') {
      const text = String(ev.message?.text ?? '');
      await supabaseAdmin.from('line_messages').insert({
        company_id: companyId,
        line_customer_id: lineCustomer.id,
        group_id: groupId || null,
        direction: 'IN',
        message_type: 'text',
        message_text: text,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
