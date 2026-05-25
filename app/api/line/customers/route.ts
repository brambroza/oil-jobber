import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function GET(req: NextRequest) {
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { data: customers, error } = await supabaseAdmin
    .from('line_customers')
    .select('id, customer_id, line_user_id, display_name, profile_image_url, created_at, updated_at, customers(company_name)')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('updated_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const ids = (customers ?? []).map((c) => c.id);
  const latestMap: Record<string, { message_text: string | null; created_at: string; direction: string }> = {};

  if (ids.length) {
    const { data: messages } = await supabaseAdmin
      .from('line_messages')
      .select('line_customer_id, message_text, created_at, direction')
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
    (customers ?? []).map((c) => ({
      ...c,
      last_message: latestMap[c.id]?.message_text ?? null,
      last_message_at: latestMap[c.id]?.created_at ?? null,
      last_message_direction: latestMap[c.id]?.direction ?? null,
    })),
  );
}
