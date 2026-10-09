-- Company-wide delivery fee surcharge (บาท/ลิตร รวม VAT).
--
-- Admin sets ONE value per company (e.g. +0.01 when world oil prices rise).
-- It is added on top of every delivered order's transport fee without
-- touching the per-customer depot fees in customer_portal_access
-- (delivery_fee_std_per_liter) or the per-order adjust.
--
-- Each order snapshots the surcharge that applied when it was created, so
-- changing the company value later does not re-price existing bills.

-- ---------- companies: the global setting ----------
alter table public.companies
  add column if not exists delivery_fee_surcharge_per_liter numeric(10,4) not null default 0;

comment on column public.companies.delivery_fee_surcharge_per_liter is
  'ค่าขนส่งเพิ่มส่วนกลาง บาท/ลิตร (รวม VAT) บวกเพิ่มทุกบิลที่จัดส่ง นอกเหนือจากค่าขนส่งมาตรฐานของคลัง';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'companies_delivery_fee_surcharge_nonneg') then
    alter table public.companies
      add constraint companies_delivery_fee_surcharge_nonneg check (delivery_fee_surcharge_per_liter >= 0);
  end if;
end $$;

-- ---------- sale_orders: per-order snapshot ----------
alter table public.sale_orders
  add column if not exists delivery_fee_surcharge_per_liter numeric(10,4) not null default 0;

comment on column public.sale_orders.delivery_fee_surcharge_per_liter is
  'ค่าขนส่งเพิ่มส่วนกลาง บาท/ลิตร (รวม VAT) snapshot ณ เวลาสร้างบิล; 0 เมื่อรับเอง';
comment on column public.sale_orders.delivery_fee_amount is
  '(std + surcharge + adjust) x ลิตรรวม คำนวณโดย trigger';

-- ---------- recompute delivery_fee_amount with the surcharge ----------
create or replace function public.refresh_sale_order_delivery_fee(p_order uuid)
returns void
language sql
set search_path = public
as $$
  update public.sale_orders so
  set delivery_fee_amount = round(
    (so.delivery_fee_std_per_liter + so.delivery_fee_surcharge_per_liter + so.delivery_fee_adjust_per_liter)
    * coalesce((select sum(i.liters) from public.sale_order_items i
                where i.sale_order_id = so.id and i.is_deleted = false), 0),
    2)
  where so.id = p_order;
$$;

create or replace function public.trg_orders_refresh_delivery_fee()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.delivery_fee_amount := round(
    (new.delivery_fee_std_per_liter + new.delivery_fee_surcharge_per_liter + new.delivery_fee_adjust_per_liter)
    * coalesce((select sum(i.liters) from public.sale_order_items i
                where i.sale_order_id = new.id and i.is_deleted = false), 0),
    2);
  return new;
end;
$$;

drop trigger if exists trg_sale_orders_delivery_fee on public.sale_orders;
create trigger trg_sale_orders_delivery_fee
before update of delivery_fee_std_per_liter, delivery_fee_surcharge_per_liter, delivery_fee_adjust_per_liter
on public.sale_orders
for each row execute function public.trg_orders_refresh_delivery_fee();
