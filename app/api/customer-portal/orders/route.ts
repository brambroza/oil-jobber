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

export async function GET() {
  const ctx = await resolvePortalContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { data, error } = await supabaseAdmin
    .from('sale_orders')
    .select('id, order_no, order_status, delivery_location, due_date, refinery_booking_number, delivery_order_no, delivery_order_file_url, requested_delivery_date, customer_po_no, receive_method, customer_vehicle_id, vehicle_license_plate, vehicle_driver_name, vehicle_driver_phone, vehicle_pickup_license_number, created_at, sale_order_items(liters, amount)')
    .eq('company_id', ctx.companyId)
    .eq('customer_id', ctx.customerId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const rows = (data ?? []).map((r: any) => ({
    ...r,
    total_liters: (r.sale_order_items ?? []).reduce((s: number, x: any) => s + Number(x.liters || 0), 0),
    total_amount: (r.sale_order_items ?? []).reduce((s: number, x: any) => s + Number(x.amount || 0), 0),
    sale_order_items: undefined,
  }));

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const ctx = await resolvePortalContext();
  if ('error' in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await req.json();
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return NextResponse.json({ error: 'กรุณาเลือกรายการสินค้าอย่างน้อย 1 รายการ' }, { status: 422 });
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
  const payload = items
    .filter((x: any) => Number(x.liters || 0) > 0)
    .map((x: any) => ({
      company_id: ctx.companyId,
      refinery_id: x.refinery_id || null,
      depot_id: x.depot_id || null,
      product_code: String(x.product_code ?? '').trim(),
      product_name: String(x.product_name ?? '').trim(),
      liters: Number(x.liters || 0),
      unit_price: Number(x.unit_price || 0),
    }));

  if (!payload.length) return NextResponse.json({ error: 'กรุณากรอกปริมาณสินค้าอย่างน้อย 1 รายการ' }, { status: 422 });
  const orderAmount = payload.reduce((sum: number, x: any) => sum + Number(x.liters || 0) * Number(x.unit_price || 0), 0);
  const creditCheck = await validateCreditLimit(ctx, orderAmount);
  if ('error' in creditCheck) return NextResponse.json({ error: creditCheck.error }, { status: creditCheck.status });

  const vehicleId = isPickupByTruck ? await ensureVehicleFromPayload(ctx, body) : null;
  const vehicleLicensePlate = isPickupByTruck ? String(body.vehicle_license_plate ?? '').trim() || null : null;
  const vehicleDriverName = isPickupByTruck ? String(body.vehicle_driver_name ?? '').trim() || null : null;
  const vehicleDriverPhone = isPickupByTruck ? String(body.vehicle_driver_phone ?? '').trim() || null : null;
  const vehiclePickupLicense = isPickupByTruck ? String(body.vehicle_pickup_license_number ?? '').trim() || null : null;
  if (isPickupByTruck && !vehicleLicensePlate) {
    return NextResponse.json({ error: 'กรุณาเลือกรถหรือระบุทะเบียนรถสำหรับการรับเองทางรถ' }, { status: 422 });
  }

  const { data: order, error: orderErr } = await supabaseAdmin
    .from('sale_orders')
    .insert({
      company_id: ctx.companyId,
      customer_id: ctx.customerId,
      order_status: 'SUBMITTED',
      requested_delivery_date: body.requested_delivery_date || null,
      customer_po_no: body.customer_po_no || null,
      delivery_note: body.delivery_note || null,
      receive_method: body.receive_method || 'DELIVER_BY_TRUCK',
      payment_condition_id: paymentConditionId,
      delivery_location: body.delivery_location || null,
      customer_vehicle_id: vehicleId,
      vehicle_license_plate: vehicleLicensePlate,
      vehicle_driver_name: vehicleDriverName,
      vehicle_driver_phone: vehicleDriverPhone,
      vehicle_pickup_license_number: vehiclePickupLicense,
      due_date: body.due_date || null,
    })
    .select('*')
    .single();

  if (orderErr) return NextResponse.json({ error: orderErr.message }, { status: 400 });

  const itemPayload = payload.map((x: any) => ({ ...x, sale_order_id: order.id }));

  const { error: itemErr } = await supabaseAdmin.from('sale_order_items').insert(itemPayload);
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 });

  return NextResponse.json(order);
}
