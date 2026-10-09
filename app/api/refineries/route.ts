import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(req: NextRequest) {
  const guard = await requireStaff();
  if (guard.response) return guard.response;
  const companyId = guard.ctx.companyId;
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });
  if (!isUuid(companyId)) return NextResponse.json({ error: 'company_id ต้องเป็น UUID เท่านั้น' }, { status: 422 });

  const { data, error } = await supabaseAdmin
    .from('refineries')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const guard = await requireStaff('refineries');
  if (guard.response) return guard.response;
  const body = await req.json();
  const companyId = guard.ctx.companyId;
  const name = String(body.name ?? '').trim();
  const contactInfo = String(body.contact_info ?? '').trim() || null;
  const imageUrl = String(body.image_url ?? '').trim() || null;
  const active = Boolean(body.active ?? true);

  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });
  if (!isUuid(companyId)) return NextResponse.json({ error: 'company_id ต้องเป็น UUID เท่านั้น' }, { status: 422 });
  if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อโรงกลั่น' }, { status: 422 });

  const { data, error } = await supabaseAdmin
    .from('refineries')
    .insert({ company_id: companyId, name, contact_info: contactInfo, image_url: imageUrl, active })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
