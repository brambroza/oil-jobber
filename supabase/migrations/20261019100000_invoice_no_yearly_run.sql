-- Shorten the tax invoice running number from IV-YYMMDD#### to IV-YY####
-- (e.g. IV-260001). The run resets every year instead of every day.
-- Invoices already issued keep their old numbers; the anchored regex below
-- only matches the new format, so old numbers never affect the new run.

create or replace function public.assign_invoice_no()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  doc_date date;
  doc_prefix text;
  next_run integer;
begin
  if nullif(btrim(new.invoice_no), '') is not null then
    return new;
  end if;

  doc_date := timezone('Asia/Bangkok', coalesce(new.created_at, now()))::date;
  doc_prefix := 'IV-' || to_char(doc_date, 'YY');

  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || ':' || doc_prefix, 0));

  select coalesce(max(right(i.invoice_no, 4)::integer), 0) + 1
    into next_run
  from public.invoices i
  where i.company_id = new.company_id
    and i.invoice_no ~ ('^' || doc_prefix || '[0-9]{4}$');

  if next_run > 9999 then
    raise exception 'เลขใบกำกับภาษีของปี % เกิน 9999 รายการแล้ว', to_char(doc_date, 'YYYY');
  end if;

  new.invoice_no := doc_prefix || lpad(next_run::text, 4, '0');
  return new;
end;
$$;
