-- Order status milestones for customer documents and delivery.
-- New statuses: PO_SENT (ส่งใบสั่งซื้อให้ลูกค้าแล้ว), DOCS_SENT (ส่งใบส่งของ/ใบแจ้งหนี้/ใบกำกับภาษีให้ลูกค้าแล้ว),
-- DELIVERED (บันทึกการส่งของแล้ว). Lifecycle:
-- DRAFT → SUBMITTED → ADMIN_REVIEW → CONFIRMED → PO_SENT → REFINERY_BOOKED → WAITING_PAYMENT → PAID
--   → PICKUP_READY → DELIVERING → DOCS_SENT → DELIVERED → COMPLETED
--
-- New enum values cannot be referenced in the same transaction that adds them,
-- so the RPC/trigger changes that use them live in the next migration file.

alter type public.order_status add value if not exists 'PO_SENT' after 'CONFIRMED';
alter type public.order_status add value if not exists 'DOCS_SENT' after 'DELIVERING';
alter type public.order_status add value if not exists 'DELIVERED' after 'DOCS_SENT';

alter table public.sale_orders
  add column if not exists po_sent_at timestamptz,
  add column if not exists documents_sent_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_receiver_name text,
  add column if not exists delivery_record_note text,
  add column if not exists delivery_recorded_by uuid references public.users_profile(id),
  add column if not exists delivery_record_no text;

comment on column public.sale_orders.po_sent_at is 'เวลาที่ส่งใบสั่งซื้อ (PDF) ให้ลูกค้าทาง LINE ครั้งแรก';
comment on column public.sale_orders.documents_sent_at is 'เวลาที่ส่งใบส่งของ/ใบแจ้งหนี้/ใบกำกับภาษี (PDF) ให้ลูกค้าทาง LINE ครั้งแรก';
comment on column public.sale_orders.delivered_at is 'วันเวลาที่ส่งของจริง (จากการบันทึกการส่งของ)';
comment on column public.sale_orders.delivery_receiver_name is 'ชื่อผู้รับของฝั่งลูกค้า';
comment on column public.sale_orders.delivery_record_note is 'หมายเหตุการส่งของ';
comment on column public.sale_orders.delivery_recorded_by is 'พนักงานที่บันทึกการส่งของ (users_profile.id)';
comment on column public.sale_orders.delivery_record_no is 'เลขที่เอกสารบันทึกการส่งของ DR-YYMMDD#### ออกอัตโนมัติเมื่อตั้ง delivered_at';

create unique index if not exists uniq_sale_orders_delivery_record_no
  on public.sale_orders (company_id, delivery_record_no)
  where is_deleted = false and delivery_record_no is not null;
