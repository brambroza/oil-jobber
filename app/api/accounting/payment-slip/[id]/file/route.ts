import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';
import { signedSlipUrl } from '@/lib/services/payment-slip';

export const runtime = 'nodejs';

/** Redirects staff to a 5-minute signed URL of the slip file (bucket is private). */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;

  const { data: slip } = await supabaseAdmin
    .from('payment_slip_submissions')
    .select('sale_order_id, file_path')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  if (!slip) return NextResponse.json({ error: 'ไม่พบสลิป' }, { status: 404 });
  if (!(await canAccessOrder(ctx, slip.sale_order_id))) return customerForbidden();

  const url = await signedSlipUrl(slip.file_path);
  if (!url) return NextResponse.json({ error: 'เปิดไฟล์สลิปไม่สำเร็จ' }, { status: 400 });
  return NextResponse.redirect(url, { status: 302 });
}
