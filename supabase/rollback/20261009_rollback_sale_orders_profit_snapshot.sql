-- Rollback for 20261009150000_sale_orders_profit_snapshot.sql
alter table public.sale_orders
  drop column if exists revenue_ex_vat_amount,
  drop column if exists cost_goods_amount,
  drop column if exists cost_delivery_amount,
  drop column if exists profit_amount,
  drop column if exists gp_percent,
  drop column if exists cost_incomplete;
