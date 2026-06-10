import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { supabaseAdmin } from '@/lib/supabase/server';

async function resolvePortalContext() {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { error: 'กรุณาเข้าสู่ระบบลูกค้า', status: 401 } as const;

  const { data: portalUser, error: portalError } = await supabaseAdmin
    .from('customer_portal_users')
    .select('customer_id, company_id, is_active')
    .eq('auth_user_id', authData.user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (portalError) return { error: portalError.message, status: 400 } as const;
  if (!portalUser) return { error: 'บัญชีนี้ยังไม่ได้รับสิทธิ์พอร์ทัลลูกค้า', status: 403 } as const;

  return { customerId: portalUser.customer_id, companyId: portalUser.company_id } as const;
}

async function ensureVehicleFromPayload(ctx: { customerId: string; companyId: string }, body: any): Promise<string | null> {
  const selectedVehicleId = String(body.customer_vehicle_id ?? '').trim();
  if (selectedVehicleId) {
    const { data: selected } = await supabaseAdmin
      .from('customer_vehicles')
      .select('id')
      .eq('id', selectedVehicleId)
      .eq('company_id', ctx.companyId)
      .eq('customer_id', ctx.customerId)
      .eq('is_deleted', false)
      .maybeSingle();
    if (selected?.id) return selected.id;
  }

  const licensePlate = String(body.vehicle_license_plate ?? '').trim();
  if (!licensePlate) return null;

  const driverName = String(body.vehicle_driver_name ?? '').trim() || null;
  const driverPhone = String(body.vehicle_driver_phone ?? '').trim() || null;
  const pickupLicense = String(body.vehicle_pickup_license_number ?? '').trim() || null;

  const { data: existing } = await supabaseAdmin
    .from('customer_vehicles')
    .select('id')
    .eq('company_id', ctx.companyId)
    .eq('customer_id', ctx.customerId)
    .eq('license_plate', licensePlate)
    .eq('is_deleted', false)
    .maybeSingle();

  if (existing?.id) {
    await supabaseAdmin
      .from('customer_vehicles')
      .update({
        driver_name: driverName,
        driver_phone: driverPhone,
        pickup_license_number: pickupLicense,
      })
      .eq('id', existing.id)
      .eq('company_id', ctx.companyId)
      .eq('customer_id', ctx.customerId);
    return existing.id;
  }

  const { data: inserted } = await supabaseAdmin
    .from('customer_vehicles')
    .insert({
      company_id: ctx.companyId,
      customer_id: ctx.customerId,
      license_plate: licensePlate,
      driver_name: driverName,
      driver_phone: driverPhone,
      pickup_license_number: pickupLicense,
    })
    .select('id')
    .single();

  return inserted?.id ?? null;
}

async function validateCreditLimit(ctx: { customerId: string; companyId: string }, orderAmount: number, replacingOrderAmount = 0) {
  const [customerRes, creditRes] = await Promise.all([
    supabaseAdmin
      .from('customers')
      .select('credit_limit')
      .eq('id', ctx.customerId)
      .eq('company_id', ctx.companyId)
      .eq('is_deleted', false)
      .single(),
    supabaseAdmin.rpc('get_customer_credit_status', { p_customer: ctx.customerId }),
  ]);

  if (customerRes.error) return { error: customerRes.error.message, status: 400 } as const;
  if (creditRes.error) return { error: creditRes.error.message, status: 400 } as const;

  const creditLimit = Number(customerRes.data?.credit_limit || 0);
  const usedCredit = Number((creditRes.data ?? [])[0]?.used_credit || 0);
  const available = Math.max(0, creditLimit - usedCredit + Number(replacingOrderAmount || 0));

  if (Number(orderAmount || 0) > available) {
    return { error: `ยอดคำสั่งซื้อเกินเครดิตคงเหลือ (${available.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท)`, status: 422 } as const;
  }

  return { ok: true } as const;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await resolvePortalContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data, error } = await supabaseAdmin
    .from('sale_orders')
    .select('*, sale_order_items(*)')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('customer_id', ctx.customerId)
    .eq('is_deleted', false)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await resolvePortalContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json();
  const isPickupByTruck = String(body.receive_method || 'DELIVER_BY_TRUCK') === 'PICKUP_BY_TRUCK';
  const paymentConditionId = String(body.payment_condition_id ?? '').trim() || null;
  if (paymentConditionId) {
    const { data: paymentCondition } = await supabaseAdmin
      .from('payment_conditions')
      .select('id')
      .eq('id', paymentConditionId)
      .eq('company_id', ctx.companyId)
      .eq('is_deleted', false)
      .maybeSingle();
    if (!paymentCondition?.id) {
      return NextResponse.json({ error: 'ไม่พบเงื่อนไขการชำระเงินที่เลือก' }, { status: 422 });
    }
  }
  const vehicleLicensePlate = isPickupByTruck ? String(body.vehicle_license_plate ?? '').trim() : '';
  if (isPickupByTruck && !vehicleLicensePlate) {
    return NextResponse.json({ error: 'กรุณาเลือกรถหรือระบุทะเบียนรถสำหรับการรับเองทางรถ' }, { status: 422 });
  }
  const vehicleId = isPickupByTruck ? await ensureVehicleFromPayload(ctx, body) : null;

  const { data: current, error: checkErr } = await supabaseAdmin
    .from('sale_orders')
    .select('id, order_status, sale_order_items(liters, unit_price, amount, is_deleted)')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('customer_id', ctx.customerId)
    .eq('is_deleted', false)
    .single();

  if (checkErr) return NextResponse.json({ error: checkErr.message }, { status: 400 });
  if (!['DRAFT', 'SUBMITTED', 'ADMIN_REVIEW'].includes(String(current.order_status))) {
    return NextResponse.json({ error: 'สถานะปัจจุบันไม่อนุญาตให้ลูกค้าแก้ไข' }, { status: 409 });
  }

  if (Array.isArray(body.items)) {
    const nextPayload = body.items
      .filter((x: any) => Number(x.liters || 0) > 0)
      .map((x: any) => ({
        liters: Number(x.liters || 0),
        unit_price: Number(x.unit_price || 0),
      }));
    const nextAmount = nextPayload.reduce((sum: number, x: any) => sum + Number(x.liters || 0) * Number(x.unit_price || 0), 0);
    const currentAmount = (current.sale_order_items || [])
      .filter((x: any) => !x.is_deleted)
      .reduce((sum: number, x: any) => sum + Number(x.amount ?? Number(x.liters || 0) * Number(x.unit_price || 0)), 0);
    const creditCheck = await validateCreditLimit(ctx, nextAmount, currentAmount);
    if ('error' in creditCheck) return NextResponse.json({ error: creditCheck.error }, { status: creditCheck.status });
  }

  const { error: orderErr } = await supabaseAdmin
    .from('sale_orders')
    .update({
      requested_delivery_date: body.requested_delivery_date || null,
      customer_po_no: body.customer_po_no || null,
      delivery_note: body.delivery_note || null,
      receive_method: body.receive_method || 'DELIVER_BY_TRUCK',
      payment_condition_id: paymentConditionId,
      delivery_location: body.delivery_location || null,
      customer_vehicle_id: vehicleId,
      vehicle_license_plate: isPickupByTruck ? vehicleLicensePlate || null : null,
      vehicle_driver_name: isPickupByTruck ? String(body.vehicle_driver_name ?? '').trim() || null : null,
      vehicle_driver_phone: isPickupByTruck ? String(body.vehicle_driver_phone ?? '').trim() || null : null,
      vehicle_pickup_license_number: isPickupByTruck ? String(body.vehicle_pickup_license_number ?? '').trim() || null : null,
      due_date: body.due_date || null,
      order_status: body.order_status || current.order_status,
    })
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('customer_id', ctx.customerId);

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 400 });

  if (Array.isArray(body.items)) {
    const { error: softErr } = await supabaseAdmin
      .from('sale_order_items')
      .update({ is_deleted: true })
      .eq('sale_order_id', id)
      .eq('company_id', ctx.companyId)
      .eq('is_deleted', false);
    if (softErr) return NextResponse.json({ error: softErr.message }, { status: 400 });

    const payload = body.items
      .filter((x: any) => Number(x.liters || 0) > 0)
      .map((x: any) => ({
        company_id: ctx.companyId,
        sale_order_id: id,
        refinery_id: x.refinery_id || null,
        depot_id: x.depot_id || null,
        product_code: String(x.product_code ?? '').trim(),
        product_name: String(x.product_name ?? '').trim(),
        liters: Number(x.liters || 0),
        unit_price: Number(x.unit_price || 0),
      }));

    if (payload.length) {
      const { error: itemErr } = await supabaseAdmin.from('sale_order_items').insert(payload);
      if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await resolvePortalContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data: current, error: checkErr } = await supabaseAdmin
    .from('sale_orders')
    .select('id, order_status')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('customer_id', ctx.customerId)
    .eq('is_deleted', false)
    .single();

  if (checkErr) return NextResponse.json({ error: checkErr.message }, { status: 400 });
  if (!['DRAFT', 'SUBMITTED', 'ADMIN_REVIEW'].includes(String(current.order_status))) {
    return NextResponse.json({ error: 'สถานะปัจจุบันไม่อนุญาตให้ลบ' }, { status: 409 });
  }

  const { error } = await supabaseAdmin.from('sale_orders').update({ is_deleted: true }).eq('id', id).eq('company_id', ctx.companyId).eq('customer_id', ctx.customerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabaseAdmin.from('sale_order_items').update({ is_deleted: true }).eq('sale_order_id', id).eq('company_id', ctx.companyId).eq('is_deleted', false);

  return NextResponse.json({ ok: true });
}
