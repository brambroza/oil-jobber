import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';
import { decideQuotation } from '@/lib/services/quotations';
import { parseBody, uuid } from '@/lib/validation/common';
import { quotationDecisionSchema } from '@/lib/validation/orders';

/**
 * Records the customer's answer on a quotation-first order:
 * `{ action: 'convert' | 'reject' | 'cancel', note? }`.
 * `convert` turns it into a sale order (SUBMITTED, normal approval flow).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { orderId } = await params;
  if (!uuid.safeParse(orderId).success) return NextResponse.json({ error: 'รหัสใบเสนอราคาไม่ถูกต้อง' }, { status: 422 });
  if (!(await canAccessOrder(guard.ctx, orderId))) return customerForbidden();

  const parsed = parseBody(quotationDecisionSchema, await req.json().catch(() => ({})));
  if (parsed.response) return parsed.response;

  const result = await decideQuotation(guard.ctx.companyId, guard.ctx.userId, orderId, parsed.data.action, parsed.data.note ?? null);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true, ...result });
}
