-- Rollback for 20261009130000_sales_manager_order_approval.sql
-- Postgres cannot drop a single enum value, so SALES_MANAGER users are moved
-- back to SALES and the value stays in the type (harmless, unused).
update public.users_profile set role = 'SALES' where role = 'SALES_MANAGER';

drop index if exists public.idx_sale_orders_approved_by;
alter table public.sale_orders
  drop column if exists approved_by,
  drop column if exists approved_at,
  drop column if exists approval_note,
  drop column if exists approved_over_credit;
