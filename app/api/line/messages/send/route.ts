import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';
import { pushLineMessage } from '@/lib/services/line';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const companyId = resolveCompanyId(body.company_id);
    const lineCustomerId = String(body.line_customer_id ?? '').trim();
    const text = String(body.text ?? '').trim();

    if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });
    if (!lineCustomerId) return NextResponse.json({ error: 'กรุณาระบุ line_customer_id' }, { status: 422 });
    if (!text) return NextResponse.json({ error: 'กรุณาระบุข้อความ' }, { status: 422 });

    const { data: customer, error: customerError } = await supabaseAdmin
      .from('line_customers')
      .select('id, line_user_id')
      .eq('id', lineCustomerId)
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .single();

    if (customerError || !customer?.line_user_id) {
      return NextResponse.json({ error: customerError?.message || 'ไม่พบข้อมูลลูกค้า LINE' }, { status: 404 });
    }

    await pushLineMessage(customer.line_user_id, text);

    const { data, error } = await supabaseAdmin
      .from('line_messages')
      .insert({
        company_id: companyId,
        line_customer_id: lineCustomerId,
        direction: 'OUT',
        message_type: 'text',
        message_text: text,
      })
      .select('id, line_customer_id, direction, message_type, message_text, created_at')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
