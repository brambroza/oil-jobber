alter table customer_portal_users
  add column if not exists display_name text,
  add column if not exists avatar_url text;

create table if not exists customer_notifications (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  customer_id uuid not null references customers(id) on delete cascade,
  title text not null,
  message text not null,
  category text not null default 'GENERAL',
  source_role text,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_customer_notifications_customer_created
on customer_notifications(company_id, customer_id, created_at desc);

create index if not exists idx_customer_notifications_unread
on customer_notifications(company_id, customer_id, is_read);

create or replace trigger trg_customer_notifications_updated_at
before update on customer_notifications
for each row execute function set_updated_at();
