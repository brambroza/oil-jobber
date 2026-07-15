import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const companyId = resolveCompanyId(body.company_id);
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });

  const customerId = String(body.customer_id ?? '').trim() || null;
  if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: 'รูปแบบ LINE customer id ไม่ถูกต้อง' }, { status: 422 });
  if (customerId && !UUID_PATTERN.test(customerId)) {
    return NextResponse.json({ error: 'รูปแบบ customer_id ไม่ถูกต้อง' }, { status: 422 });
  }

  const { data: lineCustomer, error: lineCustomerError } = await supabaseAdmin
    .from('line_customers')
    .select('id')
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (lineCustomerError) return NextResponse.json({ error: lineCustomerError.message }, { status: 400 });
  if (!lineCustomer) {
    return NextResponse.json({ error: 'ไม่พบ LINE customer ในบริษัทนี้ หรือรายการถูกลบแล้ว' }, { status: 404 });
  }

  if (customerId) {
    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .maybeSingle();

    if (customerError) return NextResponse.json({ error: customerError.message }, { status: 400 });
    if (!customer) {
      return NextResponse.json({ error: 'ไม่พบ customer_id ในบริษัทนี้ หรือข้อมูลลูกค้าถูกลบแล้ว' }, { status: 422 });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('line_customers')
    .update({ customer_id: customerId })
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .select('id, customer_id, line_user_id, group_id, conversation_key, display_name, profile_image_url, created_at, updated_at')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'อัปเดตการผูกลูกค้าไม่สำเร็จ เนื่องจากไม่พบรายการที่ตรงกัน' }, { status: 404 });

  if (customerId) {
    const { error: unlinkError } = await supabaseAdmin
      .from('line_customers')
      .update({ customer_id: null })
      .eq('company_id', companyId)
      .eq('customer_id', customerId)
      .eq('is_deleted', false)
      .neq('id', id);

    if (unlinkError) {
      return NextResponse.json({
        error: `ผูก LINE customer สำเร็จ แต่ยกเลิกการผูกรายการเดิมไม่สำเร็จ: ${unlinkError.message}`,
      }, { status: 500 });
    }
  }

  return NextResponse.json(data);
}
