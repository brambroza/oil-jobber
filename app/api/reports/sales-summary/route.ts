import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { parseQuery } from '@/lib/validation/common';
import { normalizeRange, salesSummaryQuerySchema } from '@/lib/validation/reports';
import { loadReportOrders, summarize, type ReportOrderRow } from '@/lib/services/reports';
import { round2 } from '@/lib/services/order-pricing';
import { loadCustomerScope } from '@/lib/services/customer-scope';

type GroupRow = {
  key: string;
  label: string;
  order_count: number;
  total_liters: number;
  goods_amount: number;
  delivery_fee_amount: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
};

/**
 * Sales grouped by customer, product or salesperson for a date range. Product
 * grouping sums liters and goods per product; delivery fee is order-level so it
 * appears only in the grand total there.
 */
export async function GET(req: NextRequest) {
  const guard = await requireStaff('reports');
  if (guard.response) return guard.response;

  const parsed = parseQuery(salesSummaryQuerySchema, req.nextUrl.searchParams);
  if (parsed.response) return parsed.response;
  const range = normalizeRange(parsed.data.from, parsed.data.to);
  if ('error' in range) return NextResponse.json({ error: range.error }, { status: 422 });

  const scope = await loadCustomerScope(guard.ctx);
  if (scope && 'error' in scope) return NextResponse.json({ error: scope.error }, { status: 400 });
  const rows = await loadReportOrders(guard.ctx.companyId, range.from, range.to, undefined, scope);
  if ('error' in rows) return NextResponse.json({ error: rows.error }, { status: 400 });

  const groups = new Map<string, GroupRow>();
  const bump = (key: string, label: string, r: Partial<GroupRow> & { order_count: number }) => {
    const g = groups.get(key) ?? { key, label, order_count: 0, total_liters: 0, goods_amount: 0, delivery_fee_amount: 0, discount_amount: 0, total_amount: 0, paid_amount: 0, outstanding_amount: 0 };
    g.order_count += r.order_count;
    g.total_liters += r.total_liters || 0;
    g.goods_amount = round2(g.goods_amount + (r.goods_amount || 0));
    g.delivery_fee_amount = round2(g.delivery_fee_amount + (r.delivery_fee_amount || 0));
    g.discount_amount = round2(g.discount_amount + (r.discount_amount || 0));
    g.total_amount = round2(g.total_amount + (r.total_amount || 0));
    g.paid_amount = round2(g.paid_amount + (r.paid_amount || 0));
    g.outstanding_amount = round2(g.outstanding_amount + (r.outstanding_amount || 0));
    groups.set(key, g);
  };

  const groupBy = parsed.data.group_by;
  for (const r of rows as ReportOrderRow[]) {
    if (groupBy === 'product') {
      for (const it of r.items) {
        bump(it.product_code, `${it.product_code} - ${it.product_name}`, { order_count: 1, total_liters: it.liters, goods_amount: it.amount, total_amount: it.amount });
      }
    } else if (groupBy === 'sales') {
      bump(r.sales_user_id || 'none', r.sales_user_name || 'ไม่ระบุพนักงานขาย', { ...r, order_count: 1 });
    } else {
      bump(r.customer_id, r.customer_name, { ...r, order_count: 1 });
    }
  }

  const sorted = [...groups.values()].sort((a, b) => b.total_amount - a.total_amount);
  return NextResponse.json({ range, group_by: groupBy, rows: sorted, summary: summarize(rows) });
}
