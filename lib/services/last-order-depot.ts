import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * Refinery and depot of the customer's latest order (any non-cancelled,
 * non-deleted order or quotation that has an item with a depot). Used to
 * preselect the depot on the next order.
 *
 * @param companyId - tenant scope
 * @param customerId - customer
 * @returns ids of the latest order's first item with a depot, or null
 */
export async function loadLastOrderDepot(
  companyId: string,
  customerId: string,
): Promise<{ refinery_id: string | null; depot_id: string } | null | { error: string }> {
  const { data: orders, error } = await supabaseAdmin
    .from('sale_orders')
    .select('id')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .eq('is_deleted', false)
    .neq('order_status', 'CANCELLED')
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) return { error: error.message };
  const ids = (orders ?? []).map((o) => String(o.id));
  if (!ids.length) return null;

  const { data: items, error: itemError } = await supabaseAdmin
    .from('sale_order_items')
    .select('sale_order_id, refinery_id, depot_id')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .in('sale_order_id', ids)
    .not('depot_id', 'is', null);
  if (itemError) return { error: itemError.message };

  for (const id of ids) {
    const item = (items ?? []).find((it) => String(it.sale_order_id) === id && it.depot_id);
    if (item) return { refinery_id: item.refinery_id ? String(item.refinery_id) : null, depot_id: String(item.depot_id) };
  }
  return null;
}
