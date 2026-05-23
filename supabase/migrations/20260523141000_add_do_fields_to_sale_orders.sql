alter table if exists sale_orders
  add column if not exists delivery_order_no text,
  add column if not exists delivery_order_file_url text;

create index if not exists idx_sale_orders_delivery_order_no
  on sale_orders(delivery_order_no);
