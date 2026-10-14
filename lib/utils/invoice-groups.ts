import type { OrderStatus } from '@/types/database';
import { ORDER_STATUS_ORDER, canIssueTaxInvoice } from '@/lib/utils/order-status';

export type InvoiceGroupOrder = { id: string; order_status: string };
export type InvoiceGroupInvoice = { sale_order_id: string; status: string };

export type InvoiceGroupRow<O, I> = {
  order: O;
  /** Active invoice, or the latest cancelled one when every invoice was cancelled. */
  invoice: I | null;
};

export type InvoiceGroup<O, I> = { status: OrderStatus; rows: InvoiceGroupRow<O, I>[] };

/**
 * Groups orders that may carry a tax invoice (CONFIRMED onwards, not cancelled)
 * by order status in lifecycle order, pairing each order with its invoice.
 *
 * @param orders - orders from `/api/orders`
 * @param invoices - invoices from `/api/accounting/invoice`, newest first
 * @returns non-empty groups in `ORDER_STATUS_ORDER` order
 */
export function groupInvoiceRowsByStatus<O extends InvoiceGroupOrder, I extends InvoiceGroupInvoice>(
  orders: O[],
  invoices: I[],
): InvoiceGroup<O, I>[] {
  const byOrder = new Map<string, I>();
  for (const inv of invoices) {
    const current = byOrder.get(inv.sale_order_id);
    if (!current || (current.status === 'CANCELLED' && inv.status !== 'CANCELLED')) byOrder.set(inv.sale_order_id, inv);
  }

  const groups = new Map<OrderStatus, InvoiceGroupRow<O, I>[]>();
  for (const order of orders) {
    if (!canIssueTaxInvoice(order.order_status)) continue;
    const status = order.order_status as OrderStatus;
    const rows = groups.get(status) ?? [];
    rows.push({ order, invoice: byOrder.get(order.id) ?? null });
    groups.set(status, rows);
  }

  return ORDER_STATUS_ORDER.filter((s) => groups.has(s)).map((status) => ({ status, rows: groups.get(status)! }));
}
