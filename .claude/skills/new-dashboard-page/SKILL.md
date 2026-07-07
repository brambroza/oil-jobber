---
name: new-dashboard-page
description: สร้างหน้า dashboard ใหม่ (app/dashboard/**/page.tsx) ด้วย MUI ตาม convention ของ project oiljobber-2 — ใช้เมื่อต้องเพิ่มหน้าจัดการข้อมูล (list/create/edit/delete) ให้ staff
---

# New Dashboard Page (oiljobber-2)

## เมื่อไหร่ใช้
เมื่อต้องเพิ่มหน้าใหม่ใน `app/dashboard/<module>/` สำหรับ staff จัดการข้อมูล (CRUD table)
ตัวอย่างอ้างอิงที่สมบูรณ์ที่สุดในโค้ด: `app/dashboard/depots/page.tsx`

## Layout พื้นฐาน
- หน้า list เป็น Client Component (`'use client'`) — ไม่ query Supabase ตรง, `fetch()` ไปยัง
  API route ของตัวเอง (`/api/<module>?company_id=...`)
- ใช้ `DEFAULT_COMPANY_ID = process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? ''` เป็นค่าเริ่มต้นของ
  companyId ใน state
- โครง UI มาตรฐาน: search bar (text + date) → `Table` + `TablePagination` → ปุ่ม "เพิ่ม" เปิด
  `Dialog`/`Drawer` สำหรับ create/edit form → `Dialog` ยืนยันก่อนลบ (soft delete)
- ฟอร์มใหม่/แก้ไข ใช้ MUI `TextField`, `MenuItem` (select), ตรวจ required field ฝั่ง client ก่อนยิง API
- หน้าเปล่า/ยังไม่ implement ให้ใช้ `<PageScaffold title=... description=...>` จาก
  `components/common/PageScaffold.tsx` แทนการเขียน layout เอง

## ขั้นตอน
1. ยืนยันว่ามี API route รองรับแล้ว (`app/api/<module>/route.ts` + `[id]/route.ts`) —
   ถ้ายังไม่มีให้ใช้ skill `new-api-route` ก่อน
2. เพิ่ม type ของ entity ใน `types/database.ts` ถ้ายังไม่มี (extends `BaseEntity`)
3. สร้าง `app/dashboard/<module>/page.tsx` โดยลอก pattern จาก `depots/page.tsx`:
   - state: `rows`, `loading`, `error`, `searchText`, `searchDate`, `page`, `rowsPerPage`, `open`,
     `form`, `deleteId`
   - `filteredRows` / `pagedRows` เป็น `useMemo` กรองฝั่ง client (ไม่ทำ server-side pagination)
   - `load()` async function ยิง `fetch` แล้ว `setRows`
4. ถ้าต้อง relation dropdown (เช่นเลือก refinery ใน depot) ให้ fetch ตัวเลือกคู่กันด้วย
   `Promise.all([...])` เหมือนตัวอย่าง
5. ข้อความ label/error/ปุ่มทั้งหมดเป็นภาษาไทย ให้สอดคล้องกับหน้าอื่นในระบบ
6. ถ้าหน้าต้องแยก sub-route (`new/page.tsx`, `[id]/page.tsx`) ให้ทำตามโครงที่มีอยู่ใน
   `app/dashboard/depots/`

## ข้อควรระวัง
- ห้ามเรียก Supabase client ตรงจากหน้า dashboard — ต้องผ่าน API route เท่านั้น (service role
  อยู่ฝั่ง server เท่านั้น)
- เช็คสิทธิ์ผ่าน role matrix (`lib/auth/permissions.ts`) ถ้าโมดูลใหม่ควรจำกัดสิทธิ์ตาม role ไหนบ้าง
- อย่าลืมเพิ่ม path ในเมนู/navigation ของ `DashboardShell` (`components/layout/DashboardShell.tsx`)
  ถ้าต้องการให้เข้าถึงจาก sidebar
