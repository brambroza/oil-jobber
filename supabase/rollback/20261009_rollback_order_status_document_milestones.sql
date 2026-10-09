-- Rollback for 20261009140000_order_status_document_milestones.sql and
-- 20261009141000_order_status_rpc_and_dr_no.sql.
-- Postgres cannot drop a single enum value, so orders in the new statuses are
-- moved back to the nearest older step and the values stay in the type.
update public.sale_orders set order_status = 'CONFIRMED' where order_status = 'PO_SENT';
update public.sale_orders set order_status = 'DELIVERING' where order_status in ('DOCS_SENT', 'DELIVERED');

drop trigger if exists trg_assign_delivery_record_no on public.sale_orders;
drop function if exists public.assign_delivery_record_no();

drop index if exists public.uniq_sale_orders_delivery_record_no;
alter table public.sale_orders
  drop column if exists po_sent_at,
  drop column if exists documents_sent_at,
  drop column if exists delivered_at,
  drop column if exists delivery_receiver_name,
  drop column if exists delivery_record_note,
  drop column if exists delivery_recorded_by,
  drop column if exists delivery_record_no;

-- record_order_payment: re-run 20261007103000_accounting_payment_receipt_invoice.sql
-- (section "atomic payment recording") to restore the previous status list.
