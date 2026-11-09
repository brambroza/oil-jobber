import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const guard = await requireStaff('line');
  if (guard.response) return guard.response;
  const companyId = guard.ctx.companyId;
  const lineCustomerId = String(req.nextUrl.searchParams.get('line_customer_id') ?? '').trim();
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 200);
  const after = String(req.nextUrl.searchParams.get('after') ?? '').trim();

  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });
  if (!lineCustomerId) return NextResponse.json({ error: 'กรุณาระบุ line_customer_id' }, { status: 422 });
  if (after && Number.isNaN(new Date(after).getTime())) return NextResponse.json({ error: 'รูปแบบ after ไม่ถูกต้อง' }, { status: 422 });

  // `*` so this keeps working before the message_payload migration is applied.
  let query = supabaseAdmin
    .from('line_messages')
    .select('*')
    .eq('company_id', companyId)
    .eq('line_customer_id', lineCustomerId)
    .eq('is_deleted', false);
  // Polling asks only for new rows, since Flex payloads make full reloads heavy.
  if (after) query = query.gte('created_at', after);

  // Newest first so the limit keeps the latest messages, then back to reading order.
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json((data ?? []).reverse());
}
