import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { loadCustomerScope } from '@/lib/services/customer-scope';
import { loadTripsForOrders } from '@/lib/services/deliveries';

/**
 * Delivery trips of the company's open orders for the tax invoice page, so
 * each trip shows as its own row (ออกใบกำกับตามเที่ยว). SALES only sees trips
 * of their own customers.
 */
export async function GET() {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const scope = await loadCustomerScope(ctx);
  if (scope && 'error' in scope) return NextResponse.json({ error: scope.error }, { status: 400 });
  if (Array.isArray(scope) && !scope.length) return NextResponse.json([]);

  let query = supabaseAdmin
    .from('sale_orders')
    .select('id')
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .not('delivered_at', 'is', null);
  if (Array.isArray(scope)) query = query.in('customer_id', scope);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const trips = await loadTripsForOrders(ctx.companyId, (data ?? []).map((o) => String(o.id)));
  if ('error' in trips) return NextResponse.json({ error: trips.error }, { status: 400 });
  return NextResponse.json(trips);
}
