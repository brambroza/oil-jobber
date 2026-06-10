import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

function normalizeDepotCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '_');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const companyId = resolveCompanyId(body.company_id);
  const code = normalizeDepotCode(String(body.code ?? ''));
  const name = String(body.name ?? '').trim();
  const pickup = Number(body.pickup_cost_per_liter ?? 0);
  const refineryIdRaw = String(body.refinery_id ?? '').trim();
  const refineryId = refineryIdRaw || null;

  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });
  if (!isUuid(companyId)) return NextResponse.json({ error: 'company_id ต้องเป็น UUID เท่านั้น' }, { status: 422 });
  if (!code) return NextResponse.json({ error: 'กรุณาระบุรหัสเดปอต์ (code)' }, { status: 422 });
  if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อเดปอต์' }, { status: 422 });
  if (Number.isNaN(pickup)) return NextResponse.json({ error: 'ค่ารับขึ้นต้องเป็นตัวเลข' }, { status: 422 });
  if (!refineryId) return NextResponse.json({ error: 'กรุณาเลือกโรงกลั่น' }, { status: 422 });
  if (!isUuid(refineryId)) return NextResponse.json({ error: 'refinery_id ต้องเป็น UUID เท่านั้น' }, { status: 422 });

  const { data: refineryExists } = await supabaseAdmin
    .from('refineries')
    .select('id')
    .eq('id', refineryId)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!refineryExists) return NextResponse.json({ error: 'ไม่พบโรงกลั่นที่เลือก' }, { status: 422 });

  const duplicate = await supabaseAdmin
    .from('depots')
    .select('id')
    .eq('company_id', companyId)
    .eq('code', code)
    .eq('refinery_id', refineryId)
    .eq('is_deleted', false)
    .neq('id', id)
    .limit(1);

  if (duplicate.data && duplicate.data.length > 0) {
    return NextResponse.json({ error: `รหัสเดปอต์ ${code} ถูกใช้งานในโรงกลั่นนี้แล้ว` }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from('depots')
    .update({ code, name, refinery_id: refineryId, pickup_cost_per_liter: pickup })
    .eq('id', id)
    .select('*, refineries(id, name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin.from('depots').update({ is_deleted: true }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
