-- Editable tax invoice content (หน้าใบกำกับภาษี > แก้ไข).
-- Until now the tax invoice PDF always printed the live sale order. Staff can
-- now edit the invoice itself (customer block, items, discount, note); the
-- edited content is stored on the invoice and printed instead of the order
-- while content_overridden = true. "ดึงข้อมูลล่าสุดจากใบสั่งขาย" re-snapshots
-- the order and sets the flag back to false.
-- Requires 20261007103000 / 20261007105000 (invoice snapshot + discount columns).

alter table public.invoices
  add column if not exists customer_phone text,
  add column if not exists note text,
  add column if not exists totals_snapshot jsonb,
  add column if not exists content_overridden boolean not null default false;

comment on column public.invoices.content_overridden is
  'true = the PDF prints the invoice snapshot (customer_*, items_snapshot, totals_snapshot, note) instead of the live sale order';
