-- Staff email on profile (for user management UI) and per-customer price adjustment.

alter table public.users_profile
  add column if not exists email text;

create unique index if not exists uniq_users_profile_company_email
  on public.users_profile (company_id, lower(email))
  where is_deleted = false and email is not null;

alter table public.customers
  add column if not exists price_adjustment_per_liter numeric(10,4) not null default 0;

comment on column public.customers.price_adjustment_per_liter is
  'บาท/ลิตร (รวม VAT) บวก/ลบ จากราคาขายมาตรฐาน ใช้กับทุกสินค้าของลูกค้ารายนี้';

-- Default salesperson per customer (optional). Orders still record their own sales_user_id.
alter table public.customers
  add column if not exists sales_user_id uuid references public.users_profile(id);

create index if not exists idx_customers_sales_user
  on public.customers (company_id, sales_user_id);
