alter table if exists sale_order_items
  add column if not exists refinery_id uuid null references refineries(id),
  add column if not exists depot_id uuid null references depots(id);

create index if not exists idx_sale_order_items_refinery_id on sale_order_items(refinery_id);
create index if not exists idx_sale_order_items_depot_id on sale_order_items(depot_id);
