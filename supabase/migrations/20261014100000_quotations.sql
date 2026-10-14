-- Quotations (ใบเสนอราคา) issued from a sale order, with their own running
-- number QT-YYMMDD####. Items and totals are snapshotted at issue time so the
-- printed quotation does not change when the order is edited later.

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  sale_order_id uuid not null references public.sale_orders(id),
  customer_id uuid references public.customers(id),
  quotation_no text,
  issued_at date not null default (timezone('Asia/Bangkok', now()))::date,
  valid_until date,
  status text not null default 'ISSUED',
  note text,
  customer_name text,
  customer_tax_id text,
  customer_address text,
  customer_phone text,
  items_snapshot jsonb not null default '[]'::jsonb,
  totals_snapshot jsonb not null default '{}'::jsonb,
  total_amount numeric(14,2) not null default 0,
  issued_by uuid references public.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  updated_by uuid,
  is_deleted boolean not null default false,
  constraint quotations_status_chk check (status in ('ISSUED', 'CANCELLED')),
  constraint quotations_valid_until_chk check (valid_until is null or valid_until >= issued_at)
);

create unique index if not exists uniq_quotations_company_no
  on public.quotations (company_id, quotation_no)
  where is_deleted = false and quotation_no is not null;

create unique index if not exists uniq_quotations_active_per_order
  on public.quotations (sale_order_id)
  where is_deleted = false and status <> 'CANCELLED';

create index if not exists idx_quotations_order
  on public.quotations (company_id, sale_order_id);

-- ---------- running number (same pattern as assign_invoice_no) ----------
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
  doc_prefix := 'QT-' || to_char(doc_date, 'YYMMDD');

  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || ':' || doc_prefix, 0));

  select coalesce(max(right(q.quotation_no, 4)::integer), 0) + 1
    into next_run
  from public.quotations q
  where q.company_id = new.company_id
    and q.quotation_no ~ ('^' || doc_prefix || '[0-9]{4}$');

  if next_run > 9999 then
    raise exception 'เลขใบเสนอราคาของวันที่ % เกิน 9999 รายการแล้ว', doc_date;
  end if;

  new.quotation_no := doc_prefix || lpad(next_run::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_assign_quotation_no on public.quotations;
create trigger trg_assign_quotation_no
before insert on public.quotations
for each row execute function public.assign_quotation_no();

-- ---------- RLS ----------
alter table public.quotations enable row level security;

drop policy if exists quotations_select on public.quotations;
drop policy if exists quotations_insert on public.quotations;
drop policy if exists quotations_update on public.quotations;
create policy quotations_select on public.quotations for select using (company_id = current_company_id());
create policy quotations_insert on public.quotations for insert with check (company_id = current_company_id());
create policy quotations_update on public.quotations for update using (company_id = current_company_id()) with check (company_id = current_company_id());
