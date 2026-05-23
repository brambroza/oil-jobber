alter table oil_base_prices
  add column if not exists expires_date date null,
  add column if not exists expires_at timestamptz null;

create index if not exists idx_oil_base_prices_effective_expires
  on oil_base_prices(company_id, effective_at desc, expires_at asc);
