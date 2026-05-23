alter table sale_orders
  add column if not exists requested_delivery_date date,
  add column if not exists customer_po_no text,
  add column if not exists delivery_note text,
  add column if not exists receive_method text not null default 'DELIVER_BY_TRUCK';

alter table sale_orders
  add constraint sale_orders_receive_method_chk
  check (receive_method in ('DELIVER_BY_TRUCK','PICKUP_BY_TRUCK','PICKUP_BY_BARGE','ARRANGE_TRANSPORT'));

create index if not exists idx_sale_orders_requested_delivery_date
on sale_orders(company_id, requested_delivery_date desc);
