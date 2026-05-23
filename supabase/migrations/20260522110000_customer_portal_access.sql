create table if not exists customer_portal_access (
  customer_id uuid primary key references customers(id) on delete cascade,
  company_id uuid not null references companies(id),
  allowed_refinery_ids uuid[] not null default '{}',
  allowed_depot_ids uuid[] not null default '{}',
  allowed_oil_product_ids uuid[] not null default '{}',
  allowed_payment_condition_ids uuid[] not null default '{}',
  can_place_order boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists customer_portal_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_customer_portal_users_customer_active
on customer_portal_users(customer_id, is_active)
where is_active = true;

create index if not exists idx_customer_portal_users_auth_user_id
on customer_portal_users(auth_user_id);

create index if not exists idx_customer_portal_access_company_id
on customer_portal_access(company_id);

create or replace trigger trg_customer_portal_users_updated_at
before update on customer_portal_users
for each row execute function set_updated_at();

create or replace trigger trg_customer_portal_access_updated_at
before update on customer_portal_access
for each row execute function set_updated_at();
