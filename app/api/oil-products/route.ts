import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '_');
}

function normalizeColorHex(value: unknown): string {
  const raw = String(value ?? '').trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(raw)) return raw;
  return '#2563EB';
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(req: NextRequest) {
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });
  if (!isUuid(companyId)) return NextResponse.json({ error: 'company_id ต้องเป็น UUID เท่านั้น' }, { status: 422 });

  const { data, error } = await supabaseAdmin
    .from('oil_products')
    .select('*')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const companyId = resolveCompanyId(body.company_id);
  const code = normalizeCode(String(body.code ?? ''));
  const name = String(body.name ?? '').trim();
  const isActive = Boolean(body.is_active ?? true);
  const colorHex = normalizeColorHex(body.color_hex);

  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });
  if (!isUuid(companyId)) return NextResponse.json({ error: 'company_id ต้องเป็น UUID เท่านั้น' }, { status: 422 });
  if (!code) return NextResponse.json({ error: 'กรุณาระบุรหัสน้ำมัน' }, { status: 422 });
  if (!name) return NextResponse.json({ error: 'กรุณาระบุชื่อน้ำมัน' }, { status: 422 });

  const dup = await supabaseAdmin
    .from('oil_products')
    .select('id')
    .eq('company_id', companyId)
    .eq('code', code)
    .eq('is_deleted', false)
    .limit(1);

  if (dup.data && dup.data.length > 0) {
    return NextResponse.json({ error: `รหัสน้ำมัน ${code} ถูกใช้งานแล้ว` }, { status: 409 });
  }

  const { data, error } = await supabaseAdmin
    .from('oil_products')
    .insert({ company_id: companyId, code, name, is_active: isActive, color_hex: colorHex })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
