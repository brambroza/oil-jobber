import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const companyId = resolveCompanyId(body.company_id);
  const customerId = String(body.customer_id ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  if (!companyId) return NextResponse.json({ error: 'กรุณาระบุ company_id' }, { status: 422 });
  if (!customerId) return NextResponse.json({ error: 'กรุณาระบุ customer_id' }, { status: 422 });
  if (!email) return NextResponse.json({ error: 'กรุณาระบุอีเมลลูกค้า' }, { status: 422 });
  if (password.length < 8) return NextResponse.json({ error: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }, { status: 422 });

  const existing = await supabaseAdmin
    .from('customer_portal_users')
    .select('id')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .eq('is_active', true)
    .maybeSingle();

  if (existing.error) return NextResponse.json({ error: existing.error.message }, { status: 400 });
  if (existing.data) return NextResponse.json({ error: 'ลูกค้ารายนี้มีผู้ใช้พอร์ทัลแล้ว' }, { status: 409 });

  const created = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      portal_type: 'CUSTOMER',
      customer_id: customerId,
      company_id: companyId,
    },
  });

  if (created.error || !created.data.user) {
    return NextResponse.json({ error: created.error?.message || 'สร้างผู้ใช้ลูกค้าไม่สำเร็จ' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('customer_portal_users')
    .insert({
      company_id: companyId,
      customer_id: customerId,
      auth_user_id: created.data.user.id,
      is_active: true,
    })
    .select('id, auth_user_id, is_active')
    .single();

  if (error) {
    await supabaseAdmin.auth.admin.deleteUser(created.data.user.id);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
