-- Accounting: payment details, auto-numbered receipts and invoices, seller
-- info on companies, and an atomic "record payment" RPC.

-- ---------- companies: seller info for printed documents ----------
alter table public.companies
  add column if not exists tax_id text,
  add column if not exists branch text,
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists logo_url text;

-- ---------- payment_transactions ----------
alter table public.payment_transactions
  add column if not exists payment_method text not null default 'CASH',
  add column if not exists reference_no text,
  add column if not exists slip_url text,
  add column if not exists note text,
  add column if not exists received_by uuid references public.users_profile(id),
  add column if not exists receipt_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payment_transactions_method_chk') then
    alter table public.payment_transactions
      add constraint payment_transactions_method_chk check (payment_method in ('CASH', 'TRANSFER', 'CHEQUE'));
  end if;
end $$;

create index if not exists idx_payment_transactions_order
  on public.payment_transactions (company_id, sale_order_id);

-- ---------- receipts ----------
alter table public.receipts
  add column if not exists customer_id uuid references public.customers(id),
  add column if not exists payment_transaction_id uuid references public.payment_transactions(id),
  add column if not exists payment_method text,
  add column if not exists reference_no text,
  add column if not exists customer_name text,
  add column if not exists customer_tax_id text,
  add column if not exists customer_address text;

alter table public.receipts alter column receipt_no drop not null;

create unique index if not exists uniq_receipts_company_no
  on public.receipts (company_id, receipt_no)
  where is_deleted = false and receipt_no is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payment_transactions_receipt_fk') then
    alter table public.payment_transactions
      add constraint payment_transactions_receipt_fk foreign key (receipt_id) references public.receipts(id);
  end if;
end $$;

-- ---------- invoices ----------
alter table public.invoices
  add column if not exists customer_id uuid references public.customers(id),
  add column if not exists status text not null default 'ISSUED',
  add column if not exists due_date date,
  add column if not exists goods_amount numeric(14,2),
  add column if not exists delivery_fee_amount numeric(14,2) not null default 0,
  add column if not exists subtotal_amount numeric(14,2),
  add column if not exists vat_amount numeric(14,2),
  add column if not exists total_amount numeric(14,2),
  add column if not exists customer_name text,
  add column if not exists customer_tax_id text,
  add column if not exists customer_address text,
  add column if not exists items_snapshot jsonb not null default '[]'::jsonb,
  add column if not exists issued_by uuid references public.users_profile(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_status_chk') then
    alter table public.invoices
      add constraint invoices_status_chk check (status in ('ISSUED', 'PAID', 'CANCELLED'));
  end if;
end $$;

update public.invoices set total_amount = amount where total_amount is null;

alter table public.invoices alter column invoice_no drop not null;

create unique index if not exists uniq_invoices_company_no
  on public.invoices (company_id, invoice_no)
  where is_deleted = false and invoice_no is not null;

create unique index if not exists uniq_invoices_active_per_order
  on public.invoices (sale_order_id)
  where is_deleted = false and status <> 'CANCELLED';

-- ---------- document run numbers (same pattern as assign_sale_order_no) ----------
create or replace function public.assign_receipt_no()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  doc_date date;
  doc_prefix text;
  next_run integer;
begin
  if nullif(btrim(new.receipt_no), '') is not null then
    return new;
  end if;

  doc_date := timezone('Asia/Bangkok', coalesce(new.created_at, now()))::date;
  doc_prefix := 'RC-' || to_char(doc_date, 'YYMMDD');

  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || ':' || doc_prefix, 0));

  select coalesce(max(right(r.receipt_no, 4)::integer), 0) + 1
    into next_run
  from public.receipts r
  where r.company_id = new.company_id
    and r.receipt_no ~ ('^' || doc_prefix || '[0-9]{4}$');

  if next_run > 9999 then
    raise exception 'เลขใบเสร็จของวันที่ % เกิน 9999 รายการแล้ว', doc_date;
  end if;

  new.receipt_no := doc_prefix || lpad(next_run::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_assign_receipt_no on public.receipts;
create trigger trg_assign_receipt_no
before insert on public.receipts
for each row execute function public.assign_receipt_no();

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
  doc_prefix := 'IV-' || to_char(doc_date, 'YYMMDD');

  perform pg_advisory_xact_lock(hashtextextended(new.company_id::text || ':' || doc_prefix, 0));

  select coalesce(max(right(i.invoice_no, 4)::integer), 0) + 1
    into next_run
  from public.invoices i
  where i.company_id = new.company_id
    and i.invoice_no ~ ('^' || doc_prefix || '[0-9]{4}$');

  if next_run > 9999 then
    raise exception 'เลขใบกำกับภาษีของวันที่ % เกิน 9999 รายการแล้ว', doc_date;
  end if;

  new.invoice_no := doc_prefix || lpad(next_run::text, 4, '0');
  return new;
end;
$$;

drop trigger if exists trg_assign_invoice_no on public.invoices;
create trigger trg_assign_invoice_no
before insert on public.invoices
for each row execute function public.assign_invoice_no();

-- ---------- atomic payment recording ----------
create or replace function public.record_order_payment(
  p_company uuid,
  p_order uuid,
  p_amount numeric,
  p_paid_at date,
  p_method text,
  p_reference text,
  p_slip_url text,
  p_note text,
  p_user uuid,
  p_issue_receipt boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sale_orders%rowtype;
  v_cust public.customers%rowtype;
  v_outstanding numeric;
  v_payment_id uuid;
  v_receipt_id uuid;
  v_receipt_no text;
  v_new_status public.order_status;
begin
  select * into v_order
  from public.sale_orders
  where id = p_order and company_id = p_company and is_deleted = false
  for update;

  if not found then
    raise exception 'ไม่พบคำสั่งซื้อ';
  end if;
  if v_order.order_status in ('DRAFT', 'CANCELLED') then
    raise exception 'สถานะคำสั่งซื้อไม่สามารถรับชำระได้';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'จำนวนเงินต้องมากกว่า 0';
  end if;
  if p_method not in ('CASH', 'TRANSFER', 'CHEQUE') then
    raise exception 'วิธีชำระเงินไม่ถูกต้อง';
  end if;

  v_outstanding := public.get_order_outstanding_amount(p_order);
  if p_amount > v_outstanding + 0.005 then
    raise exception 'ยอดชำระเกินยอดค้าง (คงค้าง % บาท)', to_char(v_outstanding, 'FM999,999,999,990.00');
  end if;

  insert into public.payment_transactions
    (company_id, sale_order_id, paid_at, amount, payment_method, reference_no, slip_url, note, received_by, created_by)
  values
    (p_company, p_order, coalesce(p_paid_at, current_date), p_amount, p_method, nullif(btrim(p_reference), ''),
     nullif(btrim(p_slip_url), ''), nullif(btrim(p_note), ''), p_user, p_user)
  returning id into v_payment_id;

  if p_issue_receipt then
    select * into v_cust from public.customers where id = v_order.customer_id;

    insert into public.receipts
      (company_id, sale_order_id, customer_id, payment_transaction_id, issued_at, amount, payment_method, reference_no,
       customer_name, customer_tax_id, customer_address, created_by)
    values
      (p_company, p_order, v_order.customer_id, v_payment_id, coalesce(p_paid_at, current_date), p_amount, p_method,
       nullif(btrim(p_reference), ''), v_cust.company_name, v_cust.tax_id, v_cust.address, p_user)
    returning id, receipt_no into v_receipt_id, v_receipt_no;

    update public.payment_transactions set receipt_id = v_receipt_id where id = v_payment_id;
  end if;

  v_outstanding := public.get_order_outstanding_amount(p_order);
  v_new_status := v_order.order_status;

  if v_outstanding <= 0.005
     and v_order.order_status in ('SUBMITTED', 'ADMIN_REVIEW', 'CONFIRMED', 'REFINERY_BOOKED', 'WAITING_PAYMENT') then
    v_new_status := 'PAID';
    update public.sale_orders
      set order_status = 'PAID', updated_by = p_user
      where id = p_order;
    insert into public.sale_order_status_logs (company_id, sale_order_id, from_status, to_status, note, created_by)
      values (p_company, p_order, v_order.order_status, 'PAID', 'ชำระครบจากการรับชำระเงิน', p_user);
    update public.invoices
      set status = 'PAID', updated_by = p_user
      where sale_order_id = p_order and is_deleted = false and status = 'ISSUED';
  end if;

  return jsonb_build_object(
    'payment_id', v_payment_id,
    'receipt_id', v_receipt_id,
    'receipt_no', v_receipt_no,
    'outstanding_after', v_outstanding,
    'order_status', v_new_status
  );
end;
$$;

-- ---------- storage bucket for generated PDF documents (shared via LINE) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', true, 10485760, array['application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
