-- How the bill's prices are shown/entered: ราคาไม่รวมภาษี (excl, default) or
-- ราคารวมภาษี (incl). Stored unit prices stay VAT-inclusive as before; this
-- only drives the order form and the default of the printed documents
-- (ใบเสนอราคา / ใบสั่งขาย / ใบแจ้งหนี้-ใบกำกับภาษี).

alter table public.sale_orders
  add column if not exists price_vat_mode text not null default 'excl';

alter table public.sale_orders drop constraint if exists sale_orders_price_vat_mode_chk;
alter table public.sale_orders
  add constraint sale_orders_price_vat_mode_chk check (price_vat_mode in ('excl', 'incl'));
