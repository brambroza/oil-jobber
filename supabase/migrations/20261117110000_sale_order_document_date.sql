-- Editable document date (วันที่เอกสาร) for sale orders.
-- Until now the printed ใบสั่งขาย date was derived from created_at, so it
-- could not be changed. order_date is a plain date the user can edit; it is
-- only the printed/displayed document date. The order number (PO-YYMMDD####)
-- keeps using created_at and does not change when order_date is edited.
-- Quotations already have an editable date column (quotations.issued_at).
-- Idempotent.

alter table public.sale_orders
  add column if not exists order_date date;

update public.sale_orders
set order_date = timezone('Asia/Bangkok', created_at)::date
where order_date is null;

alter table public.sale_orders
  alter column order_date set default (timezone('Asia/Bangkok', now()))::date;

alter table public.sale_orders
  alter column order_date set not null;
