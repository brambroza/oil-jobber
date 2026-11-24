import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { parseBody, uuid } from '@/lib/validation/common';
import { invoiceIssueSchema } from '@/lib/validation/accounting';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';
import { issueTripInvoice, loadTrip } from '@/lib/services/deliveries';

/**
 * Issues the tax invoice of one delivery trip: the order's lines at the
 * trip's liters, discount spread by liters, the last trip takes the rounding
 * remainder. Body `{ issued_at? }` (default: the delivery date when allowed,
 * otherwise today).
 */
export async function POST(req: Request, { params }: { params: Promise<{ deliveryId: string }> }) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { deliveryId } = await params;
  if (!uuid.safeParse(deliveryId).success) return NextResponse.json({ error: 'รหัสเที่ยวส่งของไม่ถูกต้อง' }, { status: 422 });

  const parsed = parseBody(invoiceIssueSchema, await req.json().catch(() => ({})));
  if (parsed.response) return parsed.response;

  const trip = await loadTrip(ctx.companyId, deliveryId);
  if (!trip) return NextResponse.json({ error: 'ไม่พบเที่ยวส่งของ' }, { status: 404 });
  if (!(await canAccessOrder(ctx, trip.sale_order_id))) return customerForbidden();

  const result = await issueTripInvoice(ctx.companyId, ctx.userId, deliveryId, parsed.data.issued_at ?? undefined);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(result.invoice);
}
