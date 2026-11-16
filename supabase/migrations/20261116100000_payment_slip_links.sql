-- Customer pay-in slip upload: staff create a per-order link (7 days or until
-- fully paid), the customer uploads a transfer slip without logging in, and
-- accounting approves it, which records the payment and issues the receipt.

-- ---------- links (only the SHA-256 hash of the token is stored) ----------
create table if not exists public.payment_slip_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  sale_order_id uuid not null references public.sale_orders(id),
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  sent_line_at timestamptz,
  created_by uuid references public.users_profile(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payment_slip_links_order
  on public.payment_slip_links (company_id, sale_order_id, created_at desc);

drop trigger if exists trg_payment_slip_links_updated_at on public.payment_slip_links;
create trigger trg_payment_slip_links_updated_at
before update on public.payment_slip_links
for each row execute function set_updated_at();

-- ---------- slips submitted by the customer ----------
create table if not exists public.payment_slip_submissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  sale_order_id uuid not null references public.sale_orders(id),
  link_id uuid references public.payment_slip_links(id),
  file_path text not null,
  file_mime text not null,
  amount numeric(14, 2) not null check (amount > 0),
  transferred_at date not null,
  reference_no text,
  payer_name text,
  note text,
  status text not null default 'PENDING',
  reviewed_by uuid references public.users_profile(id),
  reviewed_at timestamptz,
  reject_reason text,
  payment_transaction_id uuid references public.payment_transactions(id),
  submitter_ip text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_slip_submissions_status_chk check (status in ('PENDING', 'APPROVED', 'REJECTED'))
);

create index if not exists idx_payment_slip_submissions_status
  on public.payment_slip_submissions (company_id, status, created_at desc);
create index if not exists idx_payment_slip_submissions_order
  on public.payment_slip_submissions (sale_order_id, created_at desc);
create index if not exists idx_payment_slip_submissions_payment
  on public.payment_slip_submissions (payment_transaction_id);

drop trigger if exists trg_payment_slip_submissions_updated_at on public.payment_slip_submissions;
create trigger trg_payment_slip_submissions_updated_at
before update on public.payment_slip_submissions
for each row execute function set_updated_at();

-- ---------- RLS (server uses the service role; staff reads scoped to company) ----------
alter table public.payment_slip_links enable row level security;
alter table public.payment_slip_submissions enable row level security;

drop policy if exists payment_slip_links_select on public.payment_slip_links;
create policy payment_slip_links_select on public.payment_slip_links
  for select using (company_id = current_company_id());

drop policy if exists payment_slip_submissions_select on public.payment_slip_submissions;
create policy payment_slip_submissions_select on public.payment_slip_submissions
  for select using (company_id = current_company_id());

-- ---------- private bucket for slips (served to staff via signed URLs) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-slips', 'payment-slips', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ---------- approve: record payment + receipt and mark the slip in one transaction ----------
create or replace function public.approve_payment_slip(
  p_company uuid,
  p_submission uuid,
  p_amount numeric,
  p_paid_at date,
  p_method text,
  p_reference text,
  p_note text,
  p_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.payment_slip_submissions%rowtype;
  v_result jsonb;
begin
  select * into v_sub
  from public.payment_slip_submissions
  where id = p_submission and company_id = p_company
  for update;

  if not found then
    raise exception 'ไม่พบสลิป';
  end if;
  if v_sub.status <> 'PENDING' then
    raise exception 'สลิปนี้ถูกตรวจสอบไปแล้ว';
  end if;

  v_result := public.record_order_payment(
    p_company, v_sub.sale_order_id, p_amount, p_paid_at, p_method, p_reference,
    'payment-slips/' || v_sub.file_path, p_note, p_user, true
  );

  update public.payment_slip_submissions
    set status = 'APPROVED',
        reviewed_by = p_user,
        reviewed_at = now(),
        payment_transaction_id = (v_result ->> 'payment_id')::uuid
    where id = p_submission;

  return v_result || jsonb_build_object('submission_id', p_submission, 'sale_order_id', v_sub.sale_order_id);
end;
$$;

revoke all on function public.approve_payment_slip(uuid, uuid, numeric, date, text, text, text, uuid) from public, anon, authenticated;
