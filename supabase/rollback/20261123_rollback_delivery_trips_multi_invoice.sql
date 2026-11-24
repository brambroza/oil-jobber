-- Rollback for 20261123100000_delivery_trips_multi_invoice.sql.
--
-- Before running: an order may have only ONE active tax invoice again.
-- Cancel the extra trip invoices first, otherwise recreating
-- uniq_invoices_active_per_order fails. To list them:
--   select sale_order_id, array_agg(invoice_no) from public.invoices
--   where is_deleted = false and status <> 'CANCELLED'
--   group by sale_order_id having count(*) > 1;
--
-- sale_orders.delivered_at / delivery_record_no keep the trip summary
-- (latest time, first DR number), so the old single delivery record still shows.

drop index if exists public.uniq_invoices_active_per_delivery;
drop index if exists public.uniq_invoices_active_full_order;

create unique index if not exists uniq_invoices_active_per_order
  on public.invoices (sale_order_id)
  where is_deleted = false and status <> 'CANCELLED';

alter table public.invoices drop column if exists delivery_id;

drop function if exists public.save_order_delivery(uuid, uuid, uuid, uuid, timestamptz, jsonb, text, text, text, text);

drop trigger if exists trg_assign_trip_delivery_record_no on public.sale_order_deliveries;
drop function if exists public.assign_trip_delivery_record_no();

-- DR numbers from sale_orders only again (same body as 20261009141000).
create or replace function public.assign_delivery_record_no()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  doc_date date;
  doc_prefix text;
  next_run integer;
begin
  if new.delivered_at is null or nullif(btrim(new.delivery_record_no), '') is not null then
    return new;
  end if;

  doc_date := timezone('Asia/Bangkok', new.delivered_at)::date;
  doc_prefix := 'DR-' || to_char(doc_date, 'YYMMDD');

  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || ':' || doc_prefix, 0));

  select coalesce(max(right(so.delivery_record_no, 4)::integer), 0) + 1
    into next_run
  from public.sale_orders so
  where so.company_id = new.company_id
    and so.delivery_record_no ~ ('^' || doc_prefix || '[0-9]{4}$');

  if next_run > 9999 then
    raise exception 'เลขบันทึกการส่งของของวันที่ % เกิน 9999 รายการแล้ว', doc_date;
  end if;

  new.delivery_record_no := doc_prefix || lpad(next_run::text, 4, '0');
  return new;
end;
$$;

drop function if exists public.next_delivery_record_no(uuid, timestamptz);

drop table if exists public.sale_order_deliveries;
