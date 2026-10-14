import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/api-guard';
import { canApproveOrders } from '@/lib/auth/permissions';
import { supabaseAdmin } from '@/lib/supabase/server';
import { optionalText, parseBody } from '@/lib/validation/common';
import { round2 } from '@/lib/services/order-pricing';

const APPROVABLE_STATUSES = ['DRAFT', 'SUBMITTED', 'ADMIN_REVIEW'];

const approveSchema = z.object({
  /** หมายเหตุการอนุมัติ (บังคับเมื่ออนุมัติเกินวงเงิน) */
  note: optionalText(500),
  /** ยืนยันอนุมัติทั้งที่วงเงินเครดิตคงเหลือไม่พอ */
  allow_over_credit: z.boolean().optional().default(false),
});

export type CreditCheck = {
  payment_type: string | null;
  credit_limit: number;
  used_credit: number;
  available_credit: number;
  order_total: number;
  exceeded: boolean;
};

/** Credit position of the order's customer, with this order already counted in `used_credit`. */
async function loadCreditCheck(order: { id: string; customer_id: string; payment_condition_id: string | null }): Promise<CreditCheck | { error: string }> {
  const [creditRes, totalRes, paymentRes] = await Promise.all([
    supabaseAdmin.rpc('get_customer_credit_status', { p_customer: order.customer_id }),
    supabaseAdmin.rpc('get_order_total_amount', { p_order: order.id }),
    order.payment_condition_id
      ? supabaseAdmin.from('payment_conditions').select('payment_type').eq('id', order.payment_condition_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (creditRes.error) return { error: creditRes.error.message };
  if (totalRes.error) return { error: totalRes.error.message };
  if (paymentRes.error) return { error: paymentRes.error.message };

  const credit = (creditRes.data ?? [])[0] ?? { credit_limit: 0, used_credit: 0, available_credit: 0 };
  const paymentType = paymentRes.data?.payment_type ? String(paymentRes.data.payment_type) : null;
  const available = round2(Number(credit.available_credit || 0));
  return {
    payment_type: paymentType,
    credit_limit: round2(Number(credit.credit_limit || 0)),
    used_credit: round2(Number(credit.used_credit || 0)),
    available_credit: available,
    order_total: round2(Number(totalRes.data || 0)),
    // Only credit-term orders consume the credit line; cash orders never block.
    exceeded: paymentType === 'CREDIT' && available < 0,
  };
}

/** Credit preview for the approval dialog (approvers only). */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  if (!canApproveOrders(ctx.role)) return NextResponse.json({ error: 'เฉพาะผู้ดูแลระบบหรือผู้จัดการฝ่ายขายเท่านั้นที่อนุมัติใบสั่งขายได้' }, { status: 403 });
  const { id } = await params;

  const { data: order, error } = await supabaseAdmin
    .from('sale_orders')
    .select('id, customer_id, payment_condition_id, order_status')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!order) return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 });

  const credit = await loadCreditCheck(order);
  if ('error' in credit) return NextResponse.json({ error: credit.error }, { status: 400 });
  return NextResponse.json({ order_status: order.order_status, can_approve: APPROVABLE_STATUSES.includes(String(order.order_status)), credit });
}

/**
 * Approves an order (→ CONFIRMED) and records who approved it. Credit-term
 * orders whose customer is over the credit limit are refused with 422 unless
 * the approver sends `allow_over_credit` with a note; that override is stored.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  if (!canApproveOrders(ctx.role)) return NextResponse.json({ error: 'เฉพาะผู้ดูแลระบบหรือผู้จัดการฝ่ายขายเท่านั้นที่อนุมัติใบสั่งขายได้' }, { status: 403 });
  const { id } = await params;

  const parsed = parseBody(approveSchema, await req.json().catch(() => ({})));
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  const { data: order, error } = await supabaseAdmin
    .from('sale_orders')
    .select('id, customer_id, payment_condition_id, order_status')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!order) return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 });
  if (!APPROVABLE_STATUSES.includes(String(order.order_status))) {
    return NextResponse.json({ error: 'คำสั่งซื้อนี้ไม่ได้อยู่ในสถานะรออนุมัติ' }, { status: 422 });
  }

  const credit = await loadCreditCheck(order);
  if ('error' in credit) return NextResponse.json({ error: credit.error }, { status: 400 });

  if (credit.exceeded && !input.allow_over_credit) {
    return NextResponse.json({
      error: `วงเงินเครดิตไม่พอ (คงเหลือ ${credit.available_credit.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท) ต้องยืนยันอนุมัติเกินวงเงินพร้อมระบุเหตุผล`,
      requires_override: true,
      credit,
    }, { status: 422 });
  }
  if (credit.exceeded && !input.note) {
    return NextResponse.json({ error: 'กรุณาระบุเหตุผลที่อนุมัติเกินวงเงิน' }, { status: 422 });
  }

  const now = new Date().toISOString();
  const { data: updated, error: updateError } = await supabaseAdmin
    .from('sale_orders')
    .update({
      order_status: 'CONFIRMED',
      approved_by: ctx.userId,
      approved_at: now,
      approval_note: input.note ?? null,
      approved_over_credit: credit.exceeded,
      updated_by: ctx.userId,
    })
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .select('*')
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });

  await supabaseAdmin.from('sale_order_status_logs').insert({
    company_id: ctx.companyId,
    sale_order_id: id,
    from_status: order.order_status,
    to_status: 'CONFIRMED',
    note: credit.exceeded ? `อนุมัติเกินวงเงิน: ${input.note}` : (input.note ?? 'อนุมัติ'),
    created_by: ctx.userId,
  });

  return NextResponse.json({ ...updated, approved_by_name: ctx.fullName, credit });
}
