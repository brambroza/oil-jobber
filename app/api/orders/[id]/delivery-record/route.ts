import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/common';
import { deliveryRecordSchema } from '@/lib/validation/orders';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';
import { advanceOrderStatus } from '@/lib/services/order-status';
import { DELIVERY_RECORDABLE_STATUSES } from '@/lib/utils/order-status';
import type { OrderStatus } from '@/types/database';

/**
 * Records a delivery (บันทึกการส่งของ): stores the delivered time, receiver
 * and note, moves the order to DELIVERED when it has not passed that step, and
 * lets the DB trigger assign the DR running number. Re-posting updates the
 * stored details and keeps the existing DR number.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;
  if (!(await canAccessOrder(ctx, id))) return customerForbidden();

  const parsed = parseBody(deliveryRecordSchema, await req.json().catch(() => ({})));
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  const { data: order, error } = await supabaseAdmin
    .from('sale_orders')
    .select('id, order_status, delivered_at')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!order) return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 });
  if (!DELIVERY_RECORDABLE_STATUSES.includes(order.order_status as OrderStatus)) {
    return NextResponse.json({ error: 'คำสั่งซื้อนี้ยังไม่ได้รับการอนุมัติ หรือปิดงาน/ยกเลิกแล้ว จึงบันทึกการส่งของไม่ได้' }, { status: 422 });
  }

  const result = await advanceOrderStatus(
    ctx.companyId,
    id,
    ctx.userId,
    'DELIVERED',
    {
      delivered_at: input.delivered_at ?? order.delivered_at ?? new Date().toISOString(),
      delivery_receiver_name: input.delivery_receiver_name ?? null,
      delivery_record_note: input.delivery_record_note ?? null,
      delivery_recorded_by: ctx.userId,
    },
    'บันทึกการส่งของ',
  );
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

  const { data: fresh, error: freshError } = await supabaseAdmin.from('sale_orders').select('*').eq('id', id).single();
  if (freshError) return NextResponse.json({ error: freshError.message }, { status: 400 });
  return NextResponse.json({ ...fresh, advanced: result.advanced });
}
