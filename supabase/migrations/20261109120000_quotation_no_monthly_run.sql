-- Change the quotation running number from QT-YYMMDD#### to QT-YYMM####
-- (e.g. QT-26110001). The run resets every month instead of every day.
-- Quotations already issued keep their old numbers; the anchored regex below
-- only matches the new format (exactly 4 digits after QT-YYMM), so old daily
-- numbers never affect the new run.
-- Requires 20261014100000_quotations.sql (trigger trg_assign_quotation_no).

create or replace function public.assign_quotation_no()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  doc_date date;
  doc_prefix text;
  next_run integer;
begin
  if nullif(btrim(new.quotation_no), '') is not null then
    return new;
  end if;

  doc_date := timezone('Asia/Bangkok', coalesce(new.created_at, now()))::date;
  doc_prefix := 'QT-' || to_char(doc_date, 'YYMM');

  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || ':' || doc_prefix, 0));

  select coalesce(max(right(q.quotation_no, 4)::integer), 0) + 1
    into next_run
  from public.quotations q
  where q.company_id = new.company_id
    and q.quotation_no ~ ('^' || doc_prefix || '[0-9]{4}$');

  if next_run > 9999 then
    raise exception 'เลขใบเสนอราคาของเดือน % เกิน 9999 รายการแล้ว', to_char(doc_date, 'YYYY-MM');
  end if;

  new.quotation_no := doc_prefix || lpad(next_run::text, 4, '0');
  return new;
end;
$$;
