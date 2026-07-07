# ============================================================
# CLIENT LAYER: oiljobber-2
# Business Type: software-house (internal / product build)
# Created: 2026-07-03
# ============================================================

## [SECTION: org-identity][OVERRIDE]
- Project: Oil Jobber Management Platform
- ระบบบริหารจัดการธุรกิจ "oil jobber" (ผู้ซื้อน้ำมันจากโรงกลั่น/คลัง แล้วขายต่อลูกค้าองค์กร)
  ครอบคลุม: ราคาน้ำมัน (OCR จากใบราคาโรงกลั่น), คำนวณราคาขาย, ออเดอร์/ใบส่งของ,
  บัญชี/ใบแจ้งหนี้/ยอดค้างชำระ, LINE OA + LIFF สำหรับลูกค้าสั่งของผ่านมือถือ

## [SECTION: tech-defaults][OVERRIDE]
- Frontend: Next.js 16 (App Router) + TypeScript + MUI v6 (Emotion) — ไม่ใช้ Tailwind ใน project นี้
- Backend: Next.js Route Handlers (`app/api/**/route.ts`) เท่านั้น ไม่มี server แยก
- Database: Supabase (PostgreSQL + Auth + Storage), multi-tenant ผ่าน `company_id` ทุกตาราง + RLS
- Integrations: LINE Messaging API + LIFF (`app/liff/*`, `app/api/line/*`), Typhoon OCR (`app/api/ocr/typhoon`)
- Validation: Zod (`zod` dependency) สำหรับ input validation ที่ boundary
- Package manager: yarn (มี `yarn.lock`)

## [SECTION: architecture]
- Route groups: `app/dashboard/*` (staff, ผ่าน `DashboardShell`), `app/customer/*` + `app/liff/*`
  (ลูกค้า/LINE mini-app, ผ่าน `CustomerShell`), `app/api/*` (route handlers)
- Auth: Supabase Auth; role matrix อยู่ที่ `lib/auth/permissions.ts`
  (`UserRole = SUPER_ADMIN | ADMIN | OWNER | SALES | ACCOUNTING | OPERATION`), เช็คสิทธิ์ผ่าน `canAccess(role, module)`
- Multi-tenancy: ทุก business table ขยายจาก `BaseEntity` (`id, company_id, created_at, updated_at,
  created_by, updated_by, is_deleted`) — ดู `types/database.ts`
- Company resolution: ใช้ `resolveCompanyId()` จาก `lib/supabase/company.ts` เสมอ (query param →
  `DEFAULT_COMPANY_ID`/`NEXT_PUBLIC_DEFAULT_COMPANY_ID` env) ห้าม hardcode company id
- Order lifecycle (`OrderStatus`): `DRAFT → SUBMITTED → ADMIN_REVIEW → CONFIRMED → REFINERY_BOOKED
  → WAITING_PAYMENT → PAID → PICKUP_READY → DELIVERING → COMPLETED` (หรือ `CANCELLED` ได้จากหลายจุด)
- Pricing: ราคาต้นทุน (`oil_base_prices`) มาจาก OCR ใบราคาโรงกลั่น → ราคาขายคำนวณผ่าน Postgres RPC
  `calculate_oil_selling_price` (ดู `lib/services/price-calculation.ts`) ไม่คำนวณ logic ราคาซ้ำฝั่ง client
- RPC ที่ระบบพึ่งพา: `calculate_oil_selling_price`, `get_dashboard_sales_summary`,
  `get_customer_credit_status`, `get_order_outstanding_amount`

## [SECTION: coding-conventions]
- API routes: ใช้ `supabaseAdmin` (service role, `lib/supabase/server.ts`) ไม่ใช่ browser client;
  รับ/ระบุ `company_id` ผ่าน `resolveCompanyId`; ตอบ error เป็น `{ error: message }` พร้อม status code
  ที่เหมาะสม (400/422)
- Soft delete เสมอ: query ต้อง `.eq('is_deleted', false)`; ห้าม hard delete แถวข้อมูลธุรกิจ
- Join แบบ manual: ดึง id ที่เกี่ยวข้องมาก่อน แล้ว query ตารางที่สองแยก แล้ว map เข้าด้วยกันใน memory
  (ดู `app/api/customers/route.ts` เป็นตัวอย่าง) แทนการทำ nested select ที่ซับซ้อน
- Dashboard pages เป็น client component (`'use client'`) ใช้ MUI (`Table`, `Dialog`, `Drawer`,
  `TablePagination`) fetch ข้อมูลจาก API routes ของตัวเอง ไม่ query Supabase ตรงจาก client
- UI ใหม่ที่ยังไม่ implement ให้ครอบด้วย `PageScaffold` (`components/common/PageScaffold.tsx`)
- ข้อความ UI, error message, label เป็นภาษาไทยเป็นหลัก (ดูโค้ดที่มีอยู่)

## [SECTION: database-migrations]
- ไฟล์อยู่ที่ `supabase/migrations/`, ตั้งชื่อ `YYYYMMDDHHmmss_description.sql`
- ห้ามแก้ migration ที่รันไปแล้ว/commit แล้ว — เพิ่มไฟล์ใหม่เสมอ (ตาม timestamp ปัจจุบันหรือใหม่กว่าไฟล์ล่าสุด)
- ตารางธุรกิจใหม่ทุกตัวต้องมี `company_id`, `is_deleted`, เปิด RLS + policy filter ตาม company
- แจ้งผู้ใช้ก่อน apply migration กับ Supabase จริงเสมอ (ตาม forbidden-actions ใน core layer)

## [SECTION: client-rules]
- Repository: local only ("main" branch), ยังไม่ตั้งค่า remote ที่ยืนยันแล้วใน context นี้
- ไฟล์ `.env` มีค่าจริง (Supabase/LINE/Typhoon keys) — ห้าม commit, ห้าม print ค่าใน output/log
- ก่อนแก้ schema/migration หรือ RLS policy ที่กระทบข้อมูลจริง ให้แจ้งและขอ confirm ก่อนเสมอ

## [SECTION: contacts]
- Technical Lead (client): [ยังไม่ระบุ]
- Channel: [ยังไม่ระบุ — เดาจาก org layer ว่าเป็น Line]
