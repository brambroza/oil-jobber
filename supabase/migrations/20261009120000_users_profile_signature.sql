-- Staff signature image (PNG/JPEG data URI) printed on PDF documents
-- (ใบสั่งซื้อ: ช่องพนักงานขาย, ใบเสร็จ: ช่องผู้รับเงิน).
alter table public.users_profile
  add column if not exists signature_url text;

comment on column public.users_profile.signature_url is 'ลายเซ็นพนักงานเป็น data URI (image/png หรือ image/jpeg) ใช้วางในเอกสาร PDF';
