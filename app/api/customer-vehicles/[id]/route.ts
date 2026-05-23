import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const payload = {
    customer_id: String(body.customer_id ?? '').trim() || null,
    license_plate: String(body.license_plate ?? '').trim() || null,
    driver_name: String(body.driver_name ?? '').trim() || null,
    driver_phone: String(body.driver_phone ?? '').trim() || null,
    pickup_license_number: String(body.pickup_license_number ?? '').trim() || null,
  };

  if (!payload.customer_id) return NextResponse.json({ error: 'กรุณาเลือกลูกค้า' }, { status: 422 });
  if (!payload.license_plate) return NextResponse.json({ error: 'กรุณาระบุทะเบียนรถ' }, { status: 422 });

  const { data, error } = await supabaseAdmin
    .from('customer_vehicles')
    .update(payload)
    .eq('id', id)
    .select('id, company_id, customer_id, license_plate, driver_name, driver_phone, pickup_license_number, created_at, updated_at, customers(company_name)')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin.from('customer_vehicles').update({ is_deleted: true }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

