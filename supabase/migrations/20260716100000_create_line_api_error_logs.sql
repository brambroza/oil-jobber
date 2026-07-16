create table if not exists line_api_error_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references companies(id) on delete set null,
  line_customer_id uuid references line_customers(id) on delete set null,
  line_recipient_id text not null,
  recipient_type text not null default 'UNKNOWN',
  source text,
  endpoint text not null,
  message_types text[] not null default '{}'::text[],
  http_status integer,
  error_kind text not null,
  error_message text not null,
  response_body jsonb,
  request_payload jsonb,
  line_request_id text,
  created_at timestamptz not null default now(),
  constraint line_api_error_logs_recipient_type_check
    check (recipient_type in ('USER', 'GROUP', 'ROOM', 'UNKNOWN')),
  constraint line_api_error_logs_error_kind_check
    check (error_kind in ('CONFIG', 'VALIDATION', 'NETWORK', 'LINE_API')),
  constraint line_api_error_logs_http_status_check
    check (http_status is null or http_status between 100 and 599)
);

create index if not exists idx_line_api_error_logs_company_created_at
  on line_api_error_logs (company_id, created_at desc);

create index if not exists idx_line_api_error_logs_line_customer_created_at
  on line_api_error_logs (line_customer_id, created_at desc)
  where line_customer_id is not null;

create index if not exists idx_line_api_error_logs_line_request_id
  on line_api_error_logs (line_request_id)
  where line_request_id is not null;

alter table line_api_error_logs enable row level security;

drop policy if exists line_api_error_logs_select on line_api_error_logs;
create policy line_api_error_logs_select
  on line_api_error_logs
  for select
  using (company_id = current_company_id());
