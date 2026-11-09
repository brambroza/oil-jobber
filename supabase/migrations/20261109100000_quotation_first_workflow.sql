-- Quotation-first workflow (เมนูใบเสนอราคา).
--
-- Some customers want a quotation before they commit. Such a quotation is a
-- sale order kept in DRAFT with quotation_stage = 'PENDING'; it lives only in
-- the quotations menu until the customer accepts it:
--   PENDING   → quotation, not yet an order (hidden from the orders menu / portal)
--   CONVERTED → customer accepted, now a normal order (order_status SUBMITTED)
--   CLOSED    → customer rejected / quotation cancelled (order_status CANCELLED)
-- Orders created directly keep quotation_stage = null (unchanged behaviour).

alter table public.sale_orders
  add column if not exists quotation_stage text,
  add column if not exists quotation_converted_at timestamptz,
  add column if not exists quotation_converted_by uuid references public.users_profile(id);

alter table public.sale_orders drop constraint if exists sale_orders_quotation_stage_chk;
alter table public.sale_orders
  add constraint sale_orders_quotation_stage_chk
  check (quotation_stage is null or quotation_stage in ('PENDING', 'CONVERTED', 'CLOSED'));

create index if not exists idx_sale_orders_quotation_stage
  on public.sale_orders (company_id, quotation_stage)
  where is_deleted = false and quotation_stage is not null;

-- Customer decision on a quotation.
alter table public.quotations
  add column if not exists decided_at timestamptz,
  add column if not exists decided_by uuid references public.users_profile(id),
  add column if not exists decision_note text;

alter table public.quotations drop constraint if exists quotations_status_chk;
alter table public.quotations
  add constraint quotations_status_chk
  check (status in ('ISSUED', 'ACCEPTED', 'REJECTED', 'CANCELLED'));

-- A rejected quotation no longer blocks issuing a new one for the same order.
drop index if exists public.uniq_quotations_active_per_order;
create unique index if not exists uniq_quotations_active_per_order
  on public.quotations (sale_order_id)
  where is_deleted = false and status in ('ISSUED', 'ACCEPTED');
