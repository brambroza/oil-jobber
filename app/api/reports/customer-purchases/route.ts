import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { parseQuery } from '@/lib/validation/common';
import { customerPurchasesQuerySchema, normalizeRange } from '@/lib/validation/reports';
import { loadReportOrders, summarize } from '@/lib/services/reports';
import { canAccessCustomer, customerForbidden } from '@/lib/services/customer-scope';

/** Purchase history of one customer: one row per order plus a summary. */
export async function GET(req: NextRequest) {
  const guard = await requireStaff('reports');
  if (guard.response) return guard.response;

  const parsed = parseQuery(customerPurchasesQuerySchema, req.nextUrl.searchParams);
  if (parsed.response) return parsed.response;
  const range = normalizeRange(parsed.data.from, parsed.data.to);
  if ('error' in range) return NextResponse.json({ error: range.error }, { status: 422 });
  if (!(await canAccessCustomer(guard.ctx, parsed.data.customer_id))) return customerForbidden();

  const rows = await loadReportOrders(guard.ctx.companyId, range.from, range.to, parsed.data.customer_id);
  if ('error' in rows) return NextResponse.json({ error: rows.error }, { status: 400 });
  return NextResponse.json({ range, rows, summary: summarize(rows) });
}
