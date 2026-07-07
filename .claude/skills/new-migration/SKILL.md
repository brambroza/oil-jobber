---
name: new-migration
description: สร้าง Supabase SQL migration ใหม่สำหรับ project oiljobber-2 พร้อม multi-tenant + RLS ที่ถูกต้อง — ใช้เมื่อต้องเพิ่ม/แก้ table, column, RPC, หรือ policy
---

# New Supabase Migration (oiljobber-2)

## เมื่อไหร่ใช้
เมื่อต้องเพิ่ม table ใหม่, เพิ่ม column, สร้าง/แก้ RPC function, หรือปรับ RLS policy

## กฎสำคัญ
- **ห้ามแก้ไฟล์ migration เก่าที่มีอยู่แล้ว** ใน `supabase/migrations/` — เพิ่มไฟล์ใหม่เสมอ
- **ห้าม apply migration กับ Supabase จริง (project ที่ผูกกับ .env) โดยไม่แจ้งและขอ confirm จากผู้ใช้ก่อน**
  (ตาม forbidden-actions ของ core layer — ห้าม run database migration โดยไม่แจ้งก่อน)
- ตั้งชื่อไฟล์: `YYYYMMDDHHmmss_short_description.sql` — timestamp ต้องใหม่กว่าไฟล์ล่าสุดใน
  `supabase/migrations/` เสมอ (เช็คด้วย `ls supabase/migrations | tail -5` ก่อนตั้งชื่อ)

## Checklist สำหรับ table ใหม่
ทุก business table ต้องมี column เหล่านี้ (ตาม `BaseEntity` ใน `types/database.ts`):
```sql
id uuid primary key default gen_random_uuid(),
company_id uuid not null references companies(id),
created_at timestamptz not null default now(),
updated_at timestamptz not null default now(),
created_by uuid,
updated_by uuid,
is_deleted boolean not null default false
```

ต้องเปิด RLS และมี policy filter ตาม `company_id` เสมอ เช่น:
```sql
alter table <table> enable row level security;

create policy "<table>_company_isolation" on <table>
  for all
  using (company_id = (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid);
```
(ตรวจสอบรูปแบบ claim จริงที่ใช้ในโปรเจกต์จาก policy ของ migration ก่อนหน้า เช่น
`20260522110000_customer_portal_access.sql` ก่อนเขียน policy ใหม่ ให้ตรงกัน)

## เพิ่ม column ให้ table เดิม
```sql
alter table <table> add column if not exists <col> <type> <default/constraint>;
```
ใช้ `if not exists` / `if exists` เสมอเพื่อให้ migration idempotent เท่าที่ทำได้

## RPC function
ระบบมี RPC หลักที่โค้ด TypeScript พึ่งพาอยู่แล้ว — ถ้าจะแก้ต้องคง signature เดิมไว้
(หรือแจ้ง breaking change ชัดเจน) เพราะถูกเรียกจาก `lib/services/*.ts`:
- `calculate_oil_selling_price(p_base, p_payment, p_depot, p_company)`
- `get_dashboard_sales_summary`
- `get_customer_credit_status`
- `get_order_outstanding_amount`

## หลังสร้างไฟล์
1. บอกผู้ใช้ path ของไฟล์ migration ใหม่และสรุปการเปลี่ยนแปลง
2. ถ้าต้อง apply จริง (`supabase db push` หรือรันผ่าน Supabase dashboard) — **ถามยืนยันก่อนรันเสมอ**
3. ถ้ามี TypeScript type ที่ต้องอัพเดตตาม (เช่น `types/database.ts`, `types/dto.ts`) ให้ทำคู่กัน
