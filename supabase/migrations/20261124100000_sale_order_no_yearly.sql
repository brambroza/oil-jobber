-- Shorter sale order numbers: PO-YY#### (e.g. PO-260001), running per company
-- per year (Asia/Bangkok, Gregorian YY), reset every January.
-- Was PO-YYMMDD#### (20260720120000). Existing order numbers are kept; the old
-- pattern (10 digits) never matches the new one (6 digits), so runs don't clash.
-- Rollback: supabase/rollback/20261124_rollback_sale_order_no_yearly.sql
create or replace function public.assign_sale_order_no()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  order_date date;
  order_prefix text;
  next_run integer;
begin
  if nullif(btrim(new.order_no), '') is not null then
    return new;
  end if;

  order_date := timezone('Asia/Bangkok', coalesce(new.created_at, now()))::date;
  order_prefix := 'PO-' || to_char(order_date, 'YY');

  -- Keep generation atomic per company and year while the insert transaction is open.
  perform pg_advisory_xact_lock(
    hashtextextended(new.company_id::text || ':' || order_prefix, 0)
  );

  select coalesce(max(right(so.order_no, 4)::integer), 0) + 1
    into next_run
  from public.sale_orders as so
  where so.company_id = new.company_id
    and so.order_no ~ ('^' || order_prefix || '[0-9]{4}$');

  if next_run > 9999 then
    raise exception 'เลขใบสั่งขายของปี % เกิน 9999 รายการแล้ว', to_char(order_date, 'YYYY');
  end if;

  new.order_no := order_prefix || lpad(next_run::text, 4, '0');
  return new;
end;
$$;
