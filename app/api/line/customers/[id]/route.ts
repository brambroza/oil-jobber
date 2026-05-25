import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const companyId = resolveCompanyId(body.company_id);
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });

  const customerId = String(body.customer_id ?? '').trim() || null;
  const payload = { customer_id: customerId };

  const { data, error } = await supabaseAdmin
    .from('line_customers')
    .update(payload)
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .select('id, customer_id, line_user_id, display_name, profile_image_url, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

