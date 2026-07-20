-- Generate one shared sale-order run number for every insertion path
-- (customer portal, admin dashboard, and future integrations).
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
  order_prefix := 'PO-' || to_char(order_date, 'YYMMDD');

  -- Keep generation atomic per company and day while the insert transaction is open.
  perform pg_advisory_xact_lock(
    hashtextextended(new.company_id::text || ':' || order_prefix, 0)
  );

  select coalesce(max(right(so.order_no, 4)::integer), 0) + 1
    into next_run
  from public.sale_orders as so
  where so.company_id = new.company_id
    and so.order_no ~ ('^' || order_prefix || '[0-9]{4}$');

  if next_run > 9999 then
    raise exception 'เลขคำสั่งซื้อของวันที่ % เกิน 9999 รายการแล้ว', order_date;
  end if;

  new.order_no := order_prefix || lpad(next_run::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_assign_sale_order_no on public.sale_orders;

create trigger trg_assign_sale_order_no
before insert on public.sale_orders
for each row
execute function public.assign_sale_order_no();
