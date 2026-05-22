import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function GET(req: NextRequest) {
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  const lineCustomerId = String(req.nextUrl.searchParams.get('line_customer_id') ?? '').trim();
  const limit = Number(req.nextUrl.searchParams.get('limit') ?? 200);

  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });
  if (!lineCustomerId) return NextResponse.json({ error: 'กรุณาระบุ line_customer_id' }, { status: 422 });

  const { data, error } = await supabaseAdmin
    .from('line_messages')
    .select('id, line_customer_id, direction, message_type, message_text, created_at')
    .eq('company_id', companyId)
    .eq('line_customer_id', lineCustomerId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true })
    .limit(Math.min(Math.max(limit, 1), 500));

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}
