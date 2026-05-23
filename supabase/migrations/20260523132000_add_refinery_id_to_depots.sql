alter table if exists depots
  add column if not exists refinery_id uuid references refineries(id);

create index if not exists idx_depots_refinery_id
  on depots(refinery_id);
