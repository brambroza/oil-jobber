create table if not exists line_news_broadcasts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  seq int not null default 1,
  title text not null,
  descriptions text not null,
  flex_payload jsonb,
  sent_at timestamptz,
  status text not null default 'DRAFT',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid null,
  updated_by uuid null,
  is_deleted boolean default false
);

create table if not exists line_news_broadcast_recipients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id),
  line_news_broadcast_id uuid not null references line_news_broadcasts(id),
  line_customer_id uuid not null references line_customers(id),
  sent_at timestamptz,
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid null,
  updated_by uuid null,
  is_deleted boolean default false
);

create index if not exists idx_line_news_broadcasts_company_status
on line_news_broadcasts(company_id, status, created_at desc)
where is_deleted = false;

create unique index if not exists uq_line_news_broadcasts_company_seq_active
on line_news_broadcasts(company_id, seq)
where is_deleted = false;

create unique index if not exists uq_line_news_broadcast_recipients_active
on line_news_broadcast_recipients(line_news_broadcast_id, line_customer_id)
where is_deleted = false;

alter table line_news_broadcasts enable row level security;
alter table line_news_broadcast_recipients enable row level security;

drop policy if exists line_news_broadcasts_select on line_news_broadcasts;
drop policy if exists line_news_broadcasts_insert on line_news_broadcasts;
drop policy if exists line_news_broadcasts_update on line_news_broadcasts;
create policy line_news_broadcasts_select on line_news_broadcasts for select using (company_id = current_company_id());
create policy line_news_broadcasts_insert on line_news_broadcasts for insert with check (company_id = current_company_id());
create policy line_news_broadcasts_update on line_news_broadcasts for update using (company_id = current_company_id()) with check (company_id = current_company_id());

drop policy if exists line_news_broadcast_recipients_select on line_news_broadcast_recipients;
drop policy if exists line_news_broadcast_recipients_insert on line_news_broadcast_recipients;
drop policy if exists line_news_broadcast_recipients_update on line_news_broadcast_recipients;
create policy line_news_broadcast_recipients_select on line_news_broadcast_recipients for select using (company_id = current_company_id());
create policy line_news_broadcast_recipients_insert on line_news_broadcast_recipients for insert with check (company_id = current_company_id());
create policy line_news_broadcast_recipients_update on line_news_broadcast_recipients for update using (company_id = current_company_id()) with check (company_id = current_company_id());
