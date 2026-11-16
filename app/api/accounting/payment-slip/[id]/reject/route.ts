import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/common';
import { paymentSlipRejectSchema } from '@/lib/validation/accounting';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';

/** Rejects a PENDING slip with a reason (shown to the customer on the link page). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;
  const parsed = parseBody(paymentSlipRejectSchema, await req.json().catch(() => null));
  if (parsed.response) return parsed.response;

  const { data: slip } = await supabaseAdmin
    .from('payment_slip_submissions')
    .select('sale_order_id, status')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (!slip) return NextResponse.json({ error: 'ไม่พบสลิป' }, { status: 404 });
  if (!(await canAccessOrder(ctx, slip.sale_order_id))) return customerForbidden();

  const { data, error } = await supabaseAdmin
    .from('payment_slip_submissions')
    .update({ status: 'REJECTED', reject_reason: parsed.data.reason, reviewed_by: ctx.userId, reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'PENDING')
    .select('id')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: 'สลิปนี้ถูกตรวจสอบไปแล้ว' }, { status: 409 });
  return NextResponse.json({ ok: true });
}
