alter table if exists sale_orders
  add column if not exists customer_vehicle_id uuid references customer_vehicles(id),
  add column if not exists vehicle_license_plate text,
  add column if not exists vehicle_driver_name text,
  add column if not exists vehicle_driver_phone text,
  add column if not exists vehicle_pickup_license_number text;

create index if not exists idx_sale_orders_customer_vehicle_id
  on sale_orders(customer_vehicle_id);
