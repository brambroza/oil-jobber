-- Delivery trips + one tax invoice per trip (ส่งของหลายเที่ยว ออกใบกำกับตามเที่ยว).
--
-- Until now a sale order had one delivery record (sale_orders.delivered_at /
-- delivery_record_no) and at most one active tax invoice. Oil is often
-- delivered in several truck trips, and each trip is a separate tax point, so:
--   * sale_order_deliveries holds one row per trip with its own DR-YYMMDD####
--     number and the liters delivered per order item (`lines`);
--   * invoices.delivery_id links a tax invoice to the trip it bills;
--     delivery_id = null keeps the old "whole order" invoice.
-- sale_orders.delivered_at / delivery_record_no / delivery_receiver_name stay
-- as a summary of the trips (latest time, first DR no) for existing screens.
--
-- Requires 20261009141000 (DR numbers) and 20261007103000 (invoices).
-- Rollback: supabase/rollback/20261123_rollback_delivery_trips_multi_invoice.sql

-- ---------- trips ----------
create table if not exists public.sale_order_deliveries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  sale_order_id uuid not null references public.sale_orders(id),
  trip_no integer not null,
  delivery_record_no text,
  delivered_at timestamptz not null,
  -- [{ "sale_order_item_id": uuid, "liters": number }]
  lines jsonb not null default '[]'::jsonb,
  total_liters numeric(14,2) not null default 0,
  vehicle_license_plate text,
  vehicle_driver_name text,
  receiver_name text,
  note text,
  recorded_by uuid references public.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  is_deleted boolean not null default false,
  constraint sale_order_deliveries_liters_chk check (total_liters > 0)
);

comment on table public.sale_order_deliveries is 'เที่ยวส่งของของใบสั่งขาย 1 แถว = 1 เที่ยว = บันทึกการส่งของ 1 ใบ (DR)';
comment on column public.sale_order_deliveries.lines is 'ลิตรที่ส่งต่อรายการสินค้า [{sale_order_item_id, liters}]';

create index if not exists idx_sale_order_deliveries_order
  on public.sale_order_deliveries (company_id, sale_order_id)
  where is_deleted = false;

create unique index if not exists uniq_sale_order_deliveries_dr_no
  on public.sale_order_deliveries (company_id, delivery_record_no)
  where is_deleted = false and delivery_record_no is not null;

-- ---------- DR running number shared by orders and trips ----------
create or replace function public.next_delivery_record_no(p_company uuid, p_at timestamptz)
returns text
language plpgsql
set search_path = public
as $$
declare
  doc_date date;
  doc_prefix text;
  next_run integer;
begin
  doc_date := timezone('Asia/Bangkok', p_at)::date;
  doc_prefix := 'DR-' || to_char(doc_date, 'YYMMDD');

  perform pg_advisory_xact_lock(hashtextextended(p_company::text || ':' || doc_prefix, 0));

  select coalesce(max(right(n.no, 4)::integer), 0) + 1
    into next_run
  from (
    select so.delivery_record_no as no from public.sale_orders so
    where so.company_id = p_company and so.delivery_record_no ~ ('^' || doc_prefix || '[0-9]{4}$')
    union all
    select d.delivery_record_no from public.sale_order_deliveries d
    where d.company_id = p_company and d.delivery_record_no ~ ('^' || doc_prefix || '[0-9]{4}$')
  ) n;

  if next_run > 9999 then
    raise exception 'เลขบันทึกการส่งของของวันที่ % เกิน 9999 รายการแล้ว', doc_date;
  end if;

  return doc_prefix || lpad(next_run::text, 4, '0');
end;
$$;

create or replace function public.assign_delivery_record_no()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.delivered_at is null or nullif(btrim(new.delivery_record_no), '') is not null then
    return new;
  end if;
  new.delivery_record_no := public.next_delivery_record_no(new.company_id, new.delivered_at);
  return new;
end;
$$;

create or replace function public.assign_trip_delivery_record_no()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if nullif(btrim(new.delivery_record_no), '') is not null then
    return new;
  end if;
  new.delivery_record_no := public.next_delivery_record_no(new.company_id, new.delivered_at);
  return new;
end;
$$;

drop trigger if exists trg_assign_trip_delivery_record_no on public.sale_order_deliveries;
create trigger trg_assign_trip_delivery_record_no
before insert on public.sale_order_deliveries
for each row execute function public.assign_trip_delivery_record_no();

-- ---------- record a trip atomically (liters never exceed the order) ----------
-- Locks the order row so two trips saved at the same time cannot over-deliver.
-- p_delivery null = new trip; otherwise edits that trip (its lines may only
-- change while it has no active tax invoice; the API checks that first).
create or replace function public.save_order_delivery(
  p_company uuid,
  p_order uuid,
  p_delivery uuid,
  p_user uuid,
  p_delivered_at timestamptz,
  p_lines jsonb,
  p_plate text,
  p_driver text,
  p_receiver text,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sale_orders%rowtype;
  v_line jsonb;
  v_item_id uuid;
  v_liters numeric;
  v_item_liters numeric;
  v_done numeric;
  v_total numeric := 0;
  v_clean jsonb := '[]'::jsonb;
  v_trip_no integer;
  v_row public.sale_order_deliveries%rowtype;
begin
  select * into v_order
  from public.sale_orders
  where id = p_order and company_id = p_company and is_deleted = false
  for update;
  if not found then
    raise exception 'ไม่พบคำสั่งซื้อ';
  end if;
  if v_order.order_status in ('DRAFT', 'SUBMITTED', 'ADMIN_REVIEW', 'CANCELLED') then
    raise exception 'คำสั่งซื้อนี้ยังไม่ได้รับการอนุมัติหรือถูกยกเลิกแล้ว จึงบันทึกการส่งของไม่ได้';
  end if;
  if p_delivered_at is null then
    raise exception 'กรุณาระบุวันเวลาส่งของ';
  end if;
  if jsonb_typeof(p_lines) <> 'array' then
    raise exception 'รายการลิตรไม่ถูกต้อง';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_item_id := nullif(v_line->>'sale_order_item_id', '')::uuid;
    v_liters := round(coalesce((v_line->>'liters')::numeric, 0), 2);
    if v_liters < 0 then
      raise exception 'ลิตรต้องไม่ติดลบ';
    end if;
    if v_liters = 0 then
      continue;
    end if;

    select liters into v_item_liters
    from public.sale_order_items
    where id = v_item_id and sale_order_id = p_order and is_deleted = false;
    if not found then
      raise exception 'ไม่พบรายการสินค้าในใบสั่งขายนี้';
    end if;

    select coalesce(sum((l->>'liters')::numeric), 0) into v_done
    from public.sale_order_deliveries d, jsonb_array_elements(d.lines) l
    where d.sale_order_id = p_order and d.is_deleted = false
      and (p_delivery is null or d.id <> p_delivery)
      and (l->>'sale_order_item_id')::uuid = v_item_id;

    if v_done + v_liters > v_item_liters + 0.005 then
      raise exception 'ลิตรเกินยอดใบสั่งขาย (คงเหลือ % ลิตร)', to_char(greatest(v_item_liters - v_done, 0), 'FM999,999,990.##');
    end if;

    v_total := v_total + v_liters;
    v_clean := v_clean || jsonb_build_array(jsonb_build_object('sale_order_item_id', v_item_id, 'liters', v_liters));
  end loop;

  if v_total <= 0 then
    raise exception 'ใส่ลิตรที่ส่งอย่างน้อย 1 รายการ';
  end if;

  if p_delivery is null then
    -- เลขเที่ยวนับเฉพาะเที่ยวที่ยังไม่ถูกลบ (ลบเที่ยวผิดแล้วบันทึกใหม่ได้เลขเดิม)
    select coalesce(max(trip_no), 0) + 1 into v_trip_no
    from public.sale_order_deliveries
    where sale_order_id = p_order and is_deleted = false;

    insert into public.sale_order_deliveries
      (company_id, sale_order_id, trip_no, delivered_at, lines, total_liters, vehicle_license_plate, vehicle_driver_name,
       receiver_name, note, recorded_by, created_by, updated_by)
    values
      (p_company, p_order, v_trip_no, p_delivered_at, v_clean, v_total, nullif(btrim(p_plate), ''), nullif(btrim(p_driver), ''),
       nullif(btrim(p_receiver), ''), nullif(btrim(p_note), ''), p_user, p_user, p_user)
    returning * into v_row;
  else
    update public.sale_order_deliveries
      set delivered_at = p_delivered_at,
          lines = v_clean,
          total_liters = v_total,
          vehicle_license_plate = nullif(btrim(p_plate), ''),
          vehicle_driver_name = nullif(btrim(p_driver), ''),
          receiver_name = nullif(btrim(p_receiver), ''),
          note = nullif(btrim(p_note), ''),
          updated_by = p_user,
          updated_at = now()
      where id = p_delivery and sale_order_id = p_order and company_id = p_company and is_deleted = false
      returning * into v_row;
    if not found then
      raise exception 'ไม่พบเที่ยวส่งของ';
    end if;
  end if;

  return to_jsonb(v_row);
end;
$$;

-- ---------- invoices: one per trip, or one for the whole order ----------
alter table public.invoices
  add column if not exists delivery_id uuid references public.sale_order_deliveries(id);

comment on column public.invoices.delivery_id is 'เที่ยวส่งของที่ใบกำกับนี้เรียกเก็บ; null = ใบกำกับทั้งใบสั่งขาย (แบบเดิม)';

drop index if exists public.uniq_invoices_active_per_order;

create unique index if not exists uniq_invoices_active_full_order
  on public.invoices (sale_order_id)
  where is_deleted = false and status <> 'CANCELLED' and delivery_id is null;

create unique index if not exists uniq_invoices_active_per_delivery
  on public.invoices (delivery_id)
  where is_deleted = false and status <> 'CANCELLED' and delivery_id is not null;

-- ---------- backfill: existing delivery records become trip 1 (all liters) ----------
insert into public.sale_order_deliveries
  (company_id, sale_order_id, trip_no, delivery_record_no, delivered_at, lines, total_liters, vehicle_license_plate,
   vehicle_driver_name, receiver_name, note, recorded_by, created_by, updated_by, created_at)
select
  so.company_id, so.id, 1, so.delivery_record_no, so.delivered_at,
  coalesce((select jsonb_agg(jsonb_build_object('sale_order_item_id', it.id, 'liters', it.liters) order by it.created_at)
            from public.sale_order_items it where it.sale_order_id = so.id and it.is_deleted = false and it.liters > 0), '[]'::jsonb),
  coalesce((select sum(it.liters) from public.sale_order_items it where it.sale_order_id = so.id and it.is_deleted = false), 0),
  so.vehicle_license_plate, so.vehicle_driver_name, so.delivery_receiver_name, so.delivery_record_note,
  so.delivery_recorded_by, so.delivery_recorded_by, so.delivery_recorded_by, so.delivered_at
from public.sale_orders so
where so.is_deleted = false
  and so.delivered_at is not null
  and so.delivery_record_no is not null
  and not exists (select 1 from public.sale_order_deliveries d where d.sale_order_id = so.id)
  and coalesce((select sum(it.liters) from public.sale_order_items it where it.sale_order_id = so.id and it.is_deleted = false), 0) > 0;
