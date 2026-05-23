alter table oil_products
  add column if not exists color_hex text not null default '#2563EB';

alter table oil_products
  add constraint oil_products_color_hex_chk
  check (color_hex ~ '^#[0-9A-Fa-f]{6}$');
