import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/common';
import { paymentSlipApproveSchema } from '@/lib/validation/accounting';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';

/**
 * Approves a customer slip: records the payment (amount confirmed by staff),
 * issues the receipt and marks the slip APPROVED in one DB transaction.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;
  const parsed = parseBody(paymentSlipApproveSchema, await req.json().catch(() => null));
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  const { data: slip } = await supabaseAdmin
    .from('payment_slip_submissions')
    .select('sale_order_id')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (!slip) return NextResponse.json({ error: 'ไม่พบสลิป' }, { status: 404 });
  if (!(await canAccessOrder(ctx, slip.sale_order_id))) return customerForbidden();

  const { data, error } = await supabaseAdmin.rpc('approve_payment_slip', {
    p_company: ctx.companyId,
    p_submission: id,
    p_amount: input.amount,
    p_paid_at: input.paid_at,
    p_method: input.payment_method,
    p_reference: input.reference_no ?? null,
    p_note: input.note ?? null,
    p_user: ctx.userId,
  });
  if (error) return NextResponse.json({ error: String(error.message || 'ยืนยันสลิปไม่สำเร็จ') }, { status: 422 });
  return NextResponse.json(data);
}
