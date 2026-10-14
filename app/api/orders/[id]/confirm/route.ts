import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { canApproveOrders } from '@/lib/auth/permissions';
import { supabaseAdmin } from '@/lib/supabase/server';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';

/** Confirms an order with a refinery booking number. Approvers only; records the approver. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  if (!canApproveOrders(ctx.role)) return NextResponse.json({ error: 'เฉพาะผู้ดูแลระบบหรือผู้จัดการฝ่ายขายเท่านั้นที่อนุมัติใบสั่งขายได้' }, { status: 403 });
  const { id } = await params;
  if (!(await canAccessOrder(ctx, id))) return customerForbidden();

  const body = await req.json().catch(() => ({}));
  const refineryBookingNumber = String(body.refinery_booking_number ?? '').trim() || null;

  const { data: current } = await supabaseAdmin.from('sale_orders').select('approved_by').eq('id', id).eq('company_id', ctx.companyId).maybeSingle();
  const { data, error } = await supabaseAdmin
    .from('sale_orders')
    .update({
      order_status: 'CONFIRMED',
      refinery_booking_number: refineryBookingNumber,
      ...(current?.approved_by ? {} : { approved_by: ctx.userId, approved_at: new Date().toISOString() }),
      updated_by: ctx.userId,
    })
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
