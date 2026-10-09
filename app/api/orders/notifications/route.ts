import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { loadCustomerScope } from '@/lib/services/customer-scope';

/** Order statuses that still wait for staff action; drives the sidebar badge. */
const PENDING_STATUSES = ['SUBMITTED', 'ADMIN_REVIEW'];

/**
 * Staff notification feed for the dashboard bell and the orders menu badge.
 *
 * Query params:
 * - `since` (ISO timestamp, optional): only orders created after this moment count as unread.
 *
 * Response:
 * - `unread_count`: orders created after `since` (not capped by the item limit)
 * - `pending_count`: orders in SUBMITTED / ADMIN_REVIEW
 * - `items`: latest 20 orders after `since`
 *
 * SALES users only see orders of customers they manage (`customers.sales_user_id`);
 * every other role sees the whole company.
 */
export async function GET(req: NextRequest) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const companyId = ctx.companyId;
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const scope = await loadCustomerScope(ctx);
  if (scope && 'error' in scope) return NextResponse.json({ error: scope.error }, { status: 400 });
  if (Array.isArray(scope) && !scope.length) return NextResponse.json({ unread_count: 0, pending_count: 0, items: [] });

  const sinceRaw = String(req.nextUrl.searchParams.get('since') ?? '').trim();
  const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? sinceRaw : '';

  let itemsQuery = supabaseAdmin
    .from('sale_orders')
    .select('id, created_at, order_status, customers(company_name)')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false })
    .limit(20);

  let unreadQuery = supabaseAdmin
    .from('sale_orders')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_deleted', false);

  let pendingQuery = supabaseAdmin
    .from('sale_orders')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('order_status', PENDING_STATUSES);

  if (since) {
    itemsQuery = itemsQuery.gt('created_at', since);
    unreadQuery = unreadQuery.gt('created_at', since);
  }

  if (Array.isArray(scope)) {
    itemsQuery = itemsQuery.in('customer_id', scope);
    unreadQuery = unreadQuery.in('customer_id', scope);
    pendingQuery = pendingQuery.in('customer_id', scope);
  }

  const [itemsRes, unreadRes, pendingRes] = await Promise.all([itemsQuery, unreadQuery, pendingQuery]);
  const error = itemsRes.error ?? unreadRes.error ?? pendingRes.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const items = (itemsRes.data ?? []).map((row: any) => ({
    id: row.id,
    created_at: row.created_at,
    order_status: row.order_status,
    customer_name: row.customers?.company_name ?? '-',
  }));

  return NextResponse.json({
    unread_count: unreadRes.count ?? items.length,
    pending_count: pendingRes.count ?? 0,
    items,
  });
}
