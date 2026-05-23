alter table if exists sale_orders
  add column if not exists order_no text;

create unique index if not exists uniq_sale_orders_company_order_no
  on sale_orders(company_id, order_no)
  where is_deleted = false and order_no is not null;

create index if not exists idx_sale_orders_order_no
  on sale_orders(order_no);
