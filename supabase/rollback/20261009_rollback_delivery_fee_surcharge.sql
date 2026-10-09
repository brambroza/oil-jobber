-- ============================================================
-- ROLLBACK for migration 20261009110000_delivery_fee_surcharge
--
-- DO NOT put this file in supabase/migrations/. Run it by hand only
-- after the application has been rolled back to the previous release.
--
-- Data lost: companies.delivery_fee_surcharge_per_liter and the per-order
-- snapshot sale_orders.delivery_fee_surcharge_per_liter. delivery_fee_amount
-- on orders that carried a surcharge is recomputed WITHOUT it.
--
-- Take a backup first:  supabase db dump -f backup-before-rollback.sql
-- ============================================================

begin;

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

-- Recompute amounts for orders that had a surcharge, then drop the columns.
select public.refresh_sale_order_delivery_fee(id)
from public.sale_orders
where delivery_fee_surcharge_per_liter <> 0;

alter table public.sale_orders drop column if exists delivery_fee_surcharge_per_liter;

alter table public.companies drop constraint if exists companies_delivery_fee_surcharge_nonneg;
alter table public.companies drop column if exists delivery_fee_surcharge_per_liter;

comment on column public.sale_orders.delivery_fee_amount is '(std + adjust) x ลิตรรวม คำนวณโดย trigger';

delete from supabase_migrations.schema_migrations where version = '20261009110000';

commit;
