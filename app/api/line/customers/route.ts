import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function GET(req: NextRequest) {
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const selectFields = 'id, customer_id, line_user_id, group_id, conversation_key, display_name, profile_image_url, created_at, updated_at';
  const [directRes, groupRes] = await Promise.all([
    supabaseAdmin
      .from('line_customers')
      .select(selectFields)
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .is('group_id', null)
      .order('updated_at', { ascending: false }),
    supabaseAdmin
      .from('line_customers')
      .select(selectFields)
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .not('group_id', 'is', null)
      .order('updated_at', { ascending: false }),
  ]);

  if (directRes.error) return NextResponse.json({ error: directRes.error.message }, { status: 400 });
  if (groupRes.error) return NextResponse.json({ error: groupRes.error.message }, { status: 400 });

  // A group event can arrive from different members, producing rows with
  // different line_user_id values. One group_id is one conversation.
  const groupMap = new Map<string, NonNullable<typeof groupRes.data>[number]>();
  for (const group of groupRes.data ?? []) {
    if (group.group_id && !groupMap.has(group.group_id)) groupMap.set(group.group_id, group);
  }
  const uniqueCustomers = [...(directRes.data ?? []), ...groupMap.values()];
  const ids = uniqueCustomers.map((c) => c.id);
  const latestMap: Record<string, { message_text: string | null; created_at: string; direction: string }> = {};

  if (ids.length) {
    const { data: messages } = await supabaseAdmin
      .from('line_messages')
      .select('line_customer_id, group_id, message_text, created_at, direction')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .in('line_customer_id', ids)
      .order('created_at', { ascending: false });

    for (const m of messages ?? []) {
      const key = String(m.line_customer_id ?? '');
      if (!key || latestMap[key]) continue;
      latestMap[key] = {
        message_text: m.message_text,
        created_at: String(m.created_at),
        direction: String(m.direction),
      };
    }
  }

  return NextResponse.json(
    uniqueCustomers.map((c) => ({
      ...c,
      last_message: latestMap[c.id]?.message_text ?? null,
      last_message_at: latestMap[c.id]?.created_at ?? null,
      last_message_direction: latestMap[c.id]?.direction ?? null,
    })),
  );
}
