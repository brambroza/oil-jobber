import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * Voids every active tax invoice of a sale order, the same way the invoice
 * DELETE endpoint does (`status = CANCELLED`, `is_deleted = true`).
 * Called when the order itself is cancelled so its invoice stops showing
 * in the accounting pages as unpaid.
 *
 * @param companyId - tenant id
 * @param orderId - `sale_orders.id`
 * @param userId - user performing the cancellation (`updated_by`)
 * @returns invoice numbers that were voided, or an error message
 */
export async function voidInvoicesForOrder(
  companyId: string,
  orderId: string,
  userId: string,
): Promise<{ voided: string[] } | { error: string }> {
  if (!companyId || !orderId) return { error: 'ไม่พบคำสั่งซื้อ' };
  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update({ is_deleted: true, status: 'CANCELLED', updated_by: userId })
    .eq('company_id', companyId)
    .eq('sale_order_id', orderId)
    .eq('is_deleted', false)
    .neq('status', 'CANCELLED')
    .select('invoice_no');
  if (error) return { error: error.message };
  return { voided: (data ?? []).map((r: { invoice_no: string }) => r.invoice_no) };
}
