-- Speeds up per-round item counts on /api/prices (list of price rounds).
create index if not exists idx_oil_price_items_base_price
  on oil_price_items(company_id, oil_base_price_id)
  where is_deleted = false;
