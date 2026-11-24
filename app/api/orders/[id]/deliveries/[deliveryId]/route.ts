import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody, uuid } from '@/lib/validation/common';
import { deliveryTripSchema } from '@/lib/validation/orders';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';
import { loadTrip, syncOrderDeliverySummary } from '@/lib/services/deliveries';

type Params = { params: Promise<{ id: string; deliveryId: string }> };

/** Validates the ids and loads the trip of this order. */
async function resolveTrip(companyId: string, orderId: string, deliveryId: string) {
  if (!uuid.safeParse(orderId).success || !uuid.safeParse(deliveryId).success) {
    return { response: NextResponse.json({ error: 'รหัสอ้างอิงไม่ถูกต้อง' }, { status: 422 }) };
  }
  const trip = await loadTrip(companyId, deliveryId);
  if (!trip || trip.sale_order_id !== orderId) return { response: NextResponse.json({ error: 'ไม่พบเที่ยวส่งของ' }, { status: 404 }) };
  return { trip };
}

/**
 * Edits a trip. Liters can only change while the trip has no active tax
 * invoice (cancel the invoice first); time, vehicle, receiver and note can
 * always be corrected. `issue_invoice` is ignored here.
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id, deliveryId } = await params;
  if (!(await canAccessOrder(ctx, id))) return customerForbidden();
  const resolved = await resolveTrip(ctx.companyId, id, deliveryId);
  if (resolved.response) return resolved.response;
  const { trip } = resolved;

  const parsed = parseBody(deliveryTripSchema, await req.json().catch(() => ({})));
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  if (trip.invoice) {
    const before = new Map(trip.lines.map((l) => [l.sale_order_item_id, l.liters]));
    const after = input.lines.filter((l) => l.liters > 0);
    const same = after.length === before.size && after.every((l) => Math.abs((before.get(l.sale_order_item_id) ?? -1) - l.liters) < 0.005);
    if (!same) {
      return NextResponse.json({ error: `เที่ยวนี้ออกใบกำกับภาษี ${trip.invoice.invoice_no} แล้ว แก้ลิตรไม่ได้ ต้องยกเลิกใบกำกับก่อน` }, { status: 422 });
    }
  }

  const { error } = await supabaseAdmin.rpc('save_order_delivery', {
    p_company: ctx.companyId,
    p_order: id,
    p_delivery: deliveryId,
    p_user: ctx.userId,
    p_delivered_at: input.delivered_at,
    p_lines: input.lines,
    p_plate: input.vehicle_license_plate ?? null,
    p_driver: input.vehicle_driver_name ?? null,
    p_receiver: input.receiver_name ?? null,
    p_note: input.note ?? null,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 422 });

  const sync = await syncOrderDeliverySummary(ctx.companyId, id, ctx.userId);
  if ('error' in sync) return NextResponse.json({ error: sync.error }, { status: sync.status });
  return NextResponse.json({ trip: await loadTrip(ctx.companyId, deliveryId), advanced: sync.advanced });
}

/** Removes a trip that has no active tax invoice; its liters return to the order's remainder. */
export async function DELETE(_: NextRequest, { params }: Params) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id, deliveryId } = await params;
  if (!(await canAccessOrder(ctx, id))) return customerForbidden();
  const resolved = await resolveTrip(ctx.companyId, id, deliveryId);
  if (resolved.response) return resolved.response;
  if (resolved.trip.invoice) {
    return NextResponse.json({ error: `เที่ยวนี้ออกใบกำกับภาษี ${resolved.trip.invoice.invoice_no} แล้ว ต้องยกเลิกใบกำกับก่อนจึงลบเที่ยวได้` }, { status: 422 });
  }

  const { error } = await supabaseAdmin
    .from('sale_order_deliveries')
    .update({ is_deleted: true, updated_by: ctx.userId, updated_at: new Date().toISOString() })
    .eq('id', deliveryId)
    .eq('company_id', ctx.companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const sync = await syncOrderDeliverySummary(ctx.companyId, id, ctx.userId);
  if ('error' in sync) return NextResponse.json({ error: sync.error }, { status: sync.status });
  return NextResponse.json({ ok: true });
}
