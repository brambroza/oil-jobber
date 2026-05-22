create table if not exists oil_products (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  code text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid null,
  updated_by uuid null,
  is_deleted boolean default false
);

create unique index if not exists uq_oil_products_company_code_active
on oil_products (company_id, upper(code))
where is_deleted = false;

create index if not exists idx_oil_products_company_active
on oil_products (company_id, is_active)
where is_deleted = false;

alter table oil_products enable row level security;

create policy oil_products_select on oil_products
for select using (company_id = current_company_id());

create policy oil_products_insert on oil_products
for insert with check (company_id = current_company_id());

create policy oil_products_update on oil_products
for update using (company_id = current_company_id())
with check (company_id = current_company_id());

create trigger trg_oil_products_updated_at
before update on oil_products
for each row execute function set_updated_at();
