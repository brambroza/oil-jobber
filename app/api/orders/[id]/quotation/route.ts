import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';
import { issueQuotation, loadActiveQuotation } from '@/lib/services/quotations';
import { parseBody, uuid } from '@/lib/validation/common';
import { issueQuotationSchema } from '@/lib/validation/orders';

/** Current active quotation of a sale order (`{ quotation: null }` when none). */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: 'รหัสใบสั่งขายไม่ถูกต้อง' }, { status: 422 });
  if (!(await canAccessOrder(guard.ctx, id))) return customerForbidden();

  const result = await loadActiveQuotation(guard.ctx.companyId, id);
  if ('error' in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}

/**
 * Issues a quotation (QT-YYMMDD####) from the sale order. Returns 409 with the
 * existing quotation unless `reissue` is true.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: 'รหัสใบสั่งขายไม่ถูกต้อง' }, { status: 422 });
  if (!(await canAccessOrder(guard.ctx, id))) return customerForbidden();

  const parsed = parseBody(issueQuotationSchema, await req.json().catch(() => ({})));
  if (parsed.response) return parsed.response;

  const result = await issueQuotation(guard.ctx.companyId, guard.ctx.userId, id, {
    valid_until: parsed.data.valid_until,
    note: parsed.data.note,
    reissue: parsed.data.reissue ?? false,
  });
  if ('error' in result) {
    return NextResponse.json({ error: result.error, ...(result.quotation ? { quotation: result.quotation } : {}) }, { status: result.status });
  }
  return NextResponse.json(result);
}
