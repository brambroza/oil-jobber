alter table if exists public.depots
  add column if not exists is_active boolean not null default true;

create index if not exists idx_depots_company_active
  on public.depots (company_id, is_active)
  where is_deleted = false;
