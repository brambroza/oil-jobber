import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function GET(req: NextRequest) {
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('customer_vehicles')
    .select('id, company_id, customer_id, license_plate, driver_name, driver_phone, pickup_license_number, created_at, updated_at, is_deleted, customers(company_name)')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const companyId = resolveCompanyId(body.company_id);
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });

  const licensePlate = String(body.license_plate ?? '').trim();
  const customerId = String(body.customer_id ?? '').trim();
  if (!customerId) return NextResponse.json({ error: 'กรุณาเลือกลูกค้า' }, { status: 422 });
  if (!licensePlate) return NextResponse.json({ error: 'กรุณาระบุทะเบียนรถ' }, { status: 422 });

  const payload = {
    company_id: companyId,
    customer_id: customerId,
    license_plate: licensePlate,
    driver_name: String(body.driver_name ?? '').trim() || null,
    driver_phone: String(body.driver_phone ?? '').trim() || null,
    pickup_license_number: String(body.pickup_license_number ?? '').trim() || null,
  };

  const { data, error } = await supabaseAdmin
    .from('customer_vehicles')
    .insert(payload)
    .select('id, company_id, customer_id, license_plate, driver_name, driver_phone, pickup_license_number, created_at, updated_at, customers(company_name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

