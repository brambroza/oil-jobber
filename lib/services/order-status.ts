import { supabaseAdmin } from '@/lib/supabase/server';
import { MILESTONE_TIMESTAMP_COLUMN, nextStatusAfter, statusThai, type OrderMilestone } from '@/lib/utils/order-status';
import type { OrderStatus } from '@/types/database';

export type AdvanceResult = {
  /** Status after the action (unchanged when the order was not in an advanceable step). */
  order_status: OrderStatus;
  /** True when the status actually moved. */
  advanced: boolean;
} | { error: string; status: number };

/**
 * Records a milestone on an order: always stamps the milestone timestamp
 * (first time only, so re-sending a document keeps the original time), merges
 * `extra` columns, and moves the status forward when the current status allows
 * it. A status change is written to `sale_order_status_logs`.
 */
export async function advanceOrderStatus(
  companyId: string,
  orderId: string,
  userId: string | null,
  action: OrderMilestone,
  extra: Record<string, unknown> = {},
  note?: string,
): Promise<AdvanceResult> {
  const column = MILESTONE_TIMESTAMP_COLUMN[action];
  const { data: current, error } = await supabaseAdmin
    .from('sale_orders')
    .select(`id, order_status, ${column}`)
    .eq('id', orderId)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) return { error: error.message, status: 400 };
  if (!current) return { error: 'ไม่พบคำสั่งซื้อ', status: 404 };

  const row = current as unknown as Record<string, unknown> & { order_status: OrderStatus };
  const next = nextStatusAfter(action, row.order_status);
  const payload: Record<string, unknown> = { ...extra, updated_by: userId };
  // Explicit timestamp in `extra` wins (delivery record form); otherwise stamp once.
  if (extra[column] === undefined && !row[column]) payload[column] = new Date().toISOString();
  if (next) payload.order_status = next;

  const { error: updateError } = await supabaseAdmin
    .from('sale_orders')
    .update(payload)
    .eq('id', orderId)
    .eq('company_id', companyId);
  if (updateError) return { error: updateError.message, status: 400 };

  if (next) {
    await supabaseAdmin.from('sale_order_status_logs').insert({
      company_id: companyId,
      sale_order_id: orderId,
      from_status: row.order_status,
      to_status: next,
      note: note ?? statusThai(next),
      created_by: userId,
    });
  }

  return { order_status: next ?? row.order_status, advanced: Boolean(next) };
}
