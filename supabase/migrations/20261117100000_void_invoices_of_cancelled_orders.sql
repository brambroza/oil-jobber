-- Backfill: orders cancelled before the order-cancel flow started voiding
-- invoices (lib/services/invoice-void.ts, 2026-11-16) still have an active
-- tax invoice, so they keep showing as unpaid in the accounting pages.
-- Void them the same way voidInvoicesForOrder does. Idempotent.
-- Known case at time of writing: IV-260023 (PO-2611120006).

update public.invoices i
set status = 'CANCELLED',
    is_deleted = true,
    updated_at = now()
from public.sale_orders o
where o.id = i.sale_order_id
  and o.company_id = i.company_id
  and o.order_status = 'CANCELLED'
  and i.is_deleted = false
  and i.status <> 'CANCELLED';
