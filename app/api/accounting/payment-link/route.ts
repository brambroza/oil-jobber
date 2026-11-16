import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/common';
import { paymentLinkCreateSchema } from '@/lib/validation/accounting';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';
import { createPaymentLink, loadOrderOutstanding, resolveSiteOrigin, sendPaymentLinkToLine } from '@/lib/services/payment-slip';
import { resolvePaymentLinkState } from '@/lib/utils/payment-slip';

export const runtime = 'nodejs';

/** Latest slip link of an order (`?sale_order_id=`). The URL itself cannot be shown again (only its hash is stored). */
export async function GET(req: NextRequest) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const orderId = String(req.nextUrl.searchParams.get('sale_order_id') || '').trim();
  if (!orderId) return NextResponse.json({ error: 'กรุณาระบุ sale_order_id' }, { status: 422 });
  if (!(await canAccessOrder(ctx, orderId))) return customerForbidden();

  const { data, error } = await supabaseAdmin
    .from('payment_slip_links')
    .select('id, expires_at, revoked_at, sent_line_at, created_at')
    .eq('company_id', ctx.companyId)
    .eq('sale_order_id', orderId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json(null);

  const [{ data: order }, outstanding] = await Promise.all([
    supabaseAdmin.from('sale_orders').select('order_status').eq('id', orderId).maybeSingle(),
    loadOrderOutstanding(orderId),
  ]);
  const state = resolvePaymentLinkState({ expiresAt: data.expires_at, revokedAt: data.revoked_at, outstanding, orderStatus: order?.order_status ?? null });
  return NextResponse.json({ ...data, state });
}

/**
 * Creates a new slip link for an order (older links are revoked) and optionally
 * pushes it to the customer's LINE. Returns the URL once.
 */
export async function POST(req: NextRequest) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const parsed = parseBody(paymentLinkCreateSchema, await req.json().catch(() => null));
  if (parsed.response) return parsed.response;
  const input = parsed.data;
  if (!(await canAccessOrder(ctx, input.sale_order_id))) return customerForbidden();

  const created = await createPaymentLink(ctx.companyId, input.sale_order_id, ctx.userId, resolveSiteOrigin(req.nextUrl.origin));
  if ('error' in created) return NextResponse.json({ error: created.error }, { status: created.status });

  if (!input.send_line) return NextResponse.json({ ...created, line: null });
  try {
    const sent = await sendPaymentLinkToLine(ctx.companyId, created.id, created.url);
    if ('error' in sent) return NextResponse.json({ ...created, line: { ok: false, error: sent.error } });
    return NextResponse.json({ ...created, line: { ok: true, recipient: sent.recipient } });
  } catch (error) {
    return NextResponse.json({ ...created, line: { ok: false, error: (error as Error).message } });
  }
}
