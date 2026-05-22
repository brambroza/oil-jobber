alter table oil_base_prices
  add column if not exists refinery_id uuid null references refineries(id),
  add column if not exists effective_at timestamptz null;

alter table oil_price_items
  add column if not exists depot_id uuid null references depots(id);

create index if not exists idx_oil_base_prices_refinery on oil_base_prices(company_id, refinery_id, effective_date desc);
create index if not exists idx_oil_price_items_depot on oil_price_items(company_id, depot_id);
