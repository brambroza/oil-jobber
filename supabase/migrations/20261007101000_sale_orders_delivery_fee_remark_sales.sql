-- Delivery fee as a separate order line, remark, salesperson, and per-item price breakdown.

alter table public.sale_orders
  add column if not exists delivery_fee_std_per_liter numeric(10,4) not null default 0,
  add column if not exists delivery_fee_adjust_per_liter numeric(10,4) not null default 0,
  add column if not exists delivery_fee_amount numeric(14,2) not null default 0,
  add column if not exists remark text,
  add column if not exists sales_user_id uuid references public.users_profile(id);

comment on column public.sale_orders.delivery_fee_std_per_liter is 'ค่าขนส่งมาตรฐาน บาท/ลิตร (รวม VAT) จากคลังของลูกค้า';
comment on column public.sale_orders.delivery_fee_adjust_per_liter is 'ปรับค่าขนส่ง +/- บาท/ลิตร ต่อบิล';
comment on column public.sale_orders.delivery_fee_amount is '(std + adjust) x ลิตรรวม คำนวณโดย trigger';

create index if not exists idx_sale_orders_sales_user
  on public.sale_orders (company_id, sales_user_id);

alter table public.sale_order_items
  add column if not exists base_cost_price numeric(10,4),
  add column if not exists payment_extra_per_liter numeric(10,4) not null default 0,
  add column if not exists customer_adjust_per_liter numeric(10,4) not null default 0;

-- Keep delivery_fee_amount in sync with the items' liters on every insert path.
create or replace function public.refresh_sale_order_delivery_fee(p_order uuid)
returns void
language sql
set search_path = public
as $$
  update public.sale_orders so
  set delivery_fee_amount = round(
    (so.delivery_fee_std_per_liter + so.delivery_fee_adjust_per_liter)
    * coalesce((select sum(i.liters) from public.sale_order_items i
                where i.sale_order_id = so.id and i.is_deleted = false), 0),
    2)
  where so.id = p_order;
$$;

create or replace function public.trg_items_refresh_delivery_fee()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.refresh_sale_order_delivery_fee(coalesce(new.sale_order_id, old.sale_order_id));
  return null;
end;
$$;

drop trigger if exists trg_sale_order_items_delivery_fee on public.sale_order_items;
create trigger trg_sale_order_items_delivery_fee
after insert or delete or update of liters, is_deleted on public.sale_order_items
for each row execute function public.trg_items_refresh_delivery_fee();

create or replace function public.trg_orders_refresh_delivery_fee()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.delivery_fee_amount := round(
    (new.delivery_fee_std_per_liter + new.delivery_fee_adjust_per_liter)
    * coalesce((select sum(i.liters) from public.sale_order_items i
                where i.sale_order_id = new.id and i.is_deleted = false), 0),
    2);
  return new;
end;
$$;

drop trigger if exists trg_sale_orders_delivery_fee on public.sale_orders;
create trigger trg_sale_orders_delivery_fee
before update of delivery_fee_std_per_liter, delivery_fee_adjust_per_liter on public.sale_orders
for each row execute function public.trg_orders_refresh_delivery_fee();
