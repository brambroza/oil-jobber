import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody, uuid } from '@/lib/validation/common';
import { updatePaymentSlipLinkSchema } from '@/lib/validation/accounting';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';
import { classifySlipUrl } from '@/lib/utils/slip-link';

/**
 * Voids a payment (soft delete) and its receipt. If the order was PAID and now
 * has a balance again it goes back to WAITING_PAYMENT. Admin/accounting only.
 */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  if (!['SUPER_ADMIN', 'ADMIN', 'ACCOUNTING', 'OWNER'].includes(ctx.role)) {
    return NextResponse.json({ error: 'เฉพาะผู้ดูแลระบบหรือบัญชีเท่านั้นที่ยกเลิกการรับชำระได้' }, { status: 403 });
  }
  const { id } = await params;

  const { data: payment, error } = await supabaseAdmin
    .from('payment_transactions')
    .select('id, sale_order_id, receipt_id')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!payment) return NextResponse.json({ error: 'ไม่พบรายการรับชำระ' }, { status: 404 });

  const { error: voidError } = await supabaseAdmin
    .from('payment_transactions')
    .update({ is_deleted: true, updated_by: ctx.userId })
    .eq('id', id);
  if (voidError) return NextResponse.json({ error: voidError.message }, { status: 400 });

  if (payment.receipt_id) {
    await supabaseAdmin.from('receipts').update({ is_deleted: true, updated_by: ctx.userId }).eq('id', payment.receipt_id);
  }

  const { data: outstanding } = await supabaseAdmin.rpc('get_order_outstanding_amount', { p_order: payment.sale_order_id });
  const { data: order } = await supabaseAdmin.from('sale_orders').select('order_status').eq('id', payment.sale_order_id).maybeSingle();
  if (Number(outstanding || 0) > 0 && order?.order_status === 'PAID') {
    await supabaseAdmin.from('sale_orders').update({ order_status: 'WAITING_PAYMENT', updated_by: ctx.userId }).eq('id', payment.sale_order_id);
    await supabaseAdmin.from('sale_order_status_logs').insert({
      company_id: ctx.companyId,
      sale_order_id: payment.sale_order_id,
      from_status: 'PAID',
      to_status: 'WAITING_PAYMENT',
      note: 'ยกเลิกรายการรับชำระ',
      created_by: ctx.userId,
    });
    await supabaseAdmin.from('invoices').update({ status: 'ISSUED', updated_by: ctx.userId })
      .eq('sale_order_id', payment.sale_order_id).eq('is_deleted', false).eq('status', 'PAID');
  }

  return NextResponse.json({ ok: true, outstanding_after: Number(outstanding || 0) });
}

/**
 * Attaches, changes or clears the slip link (e.g. Google Drive) of a payment so
 * the sales team can open the slip. Slips uploaded by the customer through the
 * payment link cannot be replaced here.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: 'รหัสรายการรับชำระไม่ถูกต้อง' }, { status: 422 });

  const parsed = parseBody(updatePaymentSlipLinkSchema, await req.json().catch(() => ({})));
  if (parsed.response) return parsed.response;

  const { data: payment, error } = await supabaseAdmin
    .from('payment_transactions')
    .select('id, sale_order_id, slip_url')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!payment) return NextResponse.json({ error: 'ไม่พบรายการรับชำระ' }, { status: 404 });
  if (!(await canAccessOrder(ctx, payment.sale_order_id))) return customerForbidden();
  if (classifySlipUrl(payment.slip_url).kind === 'stored') {
    return NextResponse.json({ error: 'รายการนี้มีสลิปที่ลูกค้าอัปโหลดผ่านลิงก์แจ้งชำระแล้ว แก้ลิงก์ไม่ได้' }, { status: 422 });
  }

  const slipUrl = parsed.data.slip_url ?? null;
  const { error: updateError } = await supabaseAdmin
    .from('payment_transactions')
    .update({ slip_url: slipUrl, updated_by: ctx.userId })
    .eq('id', id)
    .eq('company_id', ctx.companyId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  return NextResponse.json({ id, slip_url: slipUrl });
}
