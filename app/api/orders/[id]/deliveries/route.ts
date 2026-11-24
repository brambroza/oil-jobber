import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { canAccess } from '@/lib/auth/permissions';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody, uuid } from '@/lib/validation/common';
import { deliveryTripSchema } from '@/lib/validation/orders';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';
import {
  issueTripInvoice, loadFullOrderInvoice, loadOrderItemsForTrips, loadOrderTrips, loadTrip, syncOrderDeliverySummary,
} from '@/lib/services/deliveries';
import { deliveredByItem } from '@/lib/utils/delivery-trips';
import { DELIVERY_RECORDABLE_STATUSES } from '@/lib/utils/order-status';
import type { OrderStatus } from '@/types/database';

/**
 * Trips of an order (เที่ยวส่งของ): items with delivered / remaining liters,
 * the trips with their tax invoice, and the order's "whole order" invoice
 * when it was billed the old way.
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: 'รหัสใบสั่งขายไม่ถูกต้อง' }, { status: 422 });
  if (!(await canAccessOrder(ctx, id))) return customerForbidden();

  const { data: order, error } = await supabaseAdmin
    .from('sale_orders')
    .select('id, order_no, order_status, vehicle_license_plate, vehicle_driver_name, customers(company_name)')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!order) return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 });

  const [items, trips, fullInvoice] = await Promise.all([
    loadOrderItemsForTrips(ctx.companyId, id),
    loadOrderTrips(ctx.companyId, id),
    loadFullOrderInvoice(ctx.companyId, id),
  ]);
  if ('error' in items) return NextResponse.json({ error: items.error }, { status: 400 });
  if ('error' in trips) return NextResponse.json({ error: trips.error }, { status: 400 });

  const delivered = deliveredByItem(trips);
  return NextResponse.json({
    order: {
      id: order.id,
      order_no: order.order_no,
      order_status: order.order_status,
      customer_name: (order as any).customers?.company_name ?? null,
      vehicle_license_plate: order.vehicle_license_plate ?? null,
      vehicle_driver_name: order.vehicle_driver_name ?? null,
      can_record: DELIVERY_RECORDABLE_STATUSES.includes(order.order_status as OrderStatus),
    },
    items: items.map((it) => ({ ...it, delivered: delivered.get(it.id) || 0 })),
    trips,
    full_invoice: fullInvoice,
    can_issue_invoice: canAccess(ctx.role, 'accounting'),
  });
}

/**
 * Records a new delivery trip (บันทึกส่งของ 1 เที่ยว): liters per item may not
 * exceed what is left on the order (checked under a row lock in
 * `save_order_delivery`). `issue_invoice: true` also issues the trip's tax
 * invoice when the user may use the accounting menu; a failed invoice does not
 * undo the trip and is reported in `invoice_error`.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: 'รหัสใบสั่งขายไม่ถูกต้อง' }, { status: 422 });
  if (!(await canAccessOrder(ctx, id))) return customerForbidden();

  const parsed = parseBody(deliveryTripSchema, await req.json().catch(() => ({})));
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  const { data: order, error: orderError } = await supabaseAdmin
    .from('sale_orders')
    .select('id, order_status')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 400 });
  if (!order) return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 });
  if (!DELIVERY_RECORDABLE_STATUSES.includes(order.order_status as OrderStatus)) {
    return NextResponse.json({ error: 'คำสั่งซื้อนี้ยังไม่ได้รับการอนุมัติ หรือปิดงาน/ยกเลิกแล้ว จึงบันทึกการส่งของไม่ได้' }, { status: 422 });
  }

  const { data: saved, error } = await supabaseAdmin.rpc('save_order_delivery', {
    p_company: ctx.companyId,
    p_order: id,
    p_delivery: null,
    p_user: ctx.userId,
    p_delivered_at: input.delivered_at,
    p_lines: input.lines,
    p_plate: input.vehicle_license_plate ?? null,
    p_driver: input.vehicle_driver_name ?? null,
    p_receiver: input.receiver_name ?? null,
    p_note: input.note ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 422 });
  const tripId = String((saved as { id: string }).id);

  const sync = await syncOrderDeliverySummary(ctx.companyId, id, ctx.userId);
  if ('error' in sync) return NextResponse.json({ error: sync.error }, { status: sync.status });

  let invoice: Record<string, any> | null = null;
  let invoiceError: string | null = null;
  if (input.issue_invoice) {
    if (!canAccess(ctx.role, 'accounting')) {
      invoiceError = 'ไม่มีสิทธิ์ออกใบกำกับภาษี ให้ฝ่ายบัญชีออกจากหน้าใบกำกับภาษี';
    } else {
      const issued = await issueTripInvoice(ctx.companyId, ctx.userId, tripId);
      if ('error' in issued) invoiceError = issued.error;
      else invoice = issued.invoice;
    }
  }

  const trip = await loadTrip(ctx.companyId, tripId);
  return NextResponse.json({ trip, advanced: sync.advanced, invoice, invoice_error: invoiceError }, { status: 201 });
}
