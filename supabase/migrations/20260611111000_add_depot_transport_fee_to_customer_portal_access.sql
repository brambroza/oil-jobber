alter table customer_portal_access
  add column if not exists depot_transport_fees jsonb not null default '{}'::jsonb;
