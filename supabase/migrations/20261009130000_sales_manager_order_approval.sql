-- Role SALES_MANAGER (ผู้จัดการฝ่ายขาย) and order approval audit.
-- Approvers: SUPER_ADMIN, ADMIN, SALES_MANAGER (enforced in app code).

-- New enum value; safe inside the migration transaction because nothing in
-- this file uses it yet.
alter type public.user_role add value if not exists 'SALES_MANAGER';

alter table public.sale_orders
  add column if not exists approved_by uuid references public.users_profile(id),
  add column if not exists approved_at timestamptz,
  add column if not exists approval_note text,
  add column if not exists approved_over_credit boolean not null default false;

comment on column public.sale_orders.approved_by is 'ผู้อนุมัติใบสั่งซื้อ (users_profile.id) ตั้งเมื่อสถานะเป็น CONFIRMED';
comment on column public.sale_orders.approved_at is 'เวลาที่อนุมัติ';
comment on column public.sale_orders.approval_note is 'หมายเหตุการอนุมัติ เช่น เหตุผลที่อนุมัติเกินวงเงิน';
comment on column public.sale_orders.approved_over_credit is 'true เมื่อผู้อนุมัติยืนยันอนุมัติทั้งที่ยอดเครดิตคงเหลือไม่พอ';

create index if not exists idx_sale_orders_approved_by on public.sale_orders(company_id, approved_by) where is_deleted = false;
