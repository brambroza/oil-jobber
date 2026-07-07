---
name: new-api-route
description: สร้าง Next.js API route handler ใหม่ (app/api/**/route.ts) ตาม convention ของ project oiljobber-2 — ใช้เมื่อต้องเพิ่ม endpoint ใหม่สำหรับ resource ทางธุรกิจ
---

# New API Route (oiljobber-2)

## เมื่อไหร่ใช้
ใช้เมื่อต้องเพิ่ม API endpoint ใหม่ใน `app/api/**/route.ts` สำหรับ resource ที่มี `company_id`
(multi-tenant) เช่น customers, depots, oil-products, prices ฯลฯ

## ขั้นตอน

1. **หา table/RPC ที่เกี่ยวข้อง** ใน `types/database.ts` หรือ `supabase/migrations/`
   ถ้ายังไม่มี table ให้ใช้ skill `new-migration` ก่อน

2. **โครง route handler มาตรฐาน** (`app/api/<resource>/route.ts`):
   ```ts
   import { NextRequest, NextResponse } from 'next/server';
   import { supabaseAdmin } from '@/lib/supabase/server';
   import { resolveCompanyId } from '@/lib/supabase/company';

   export async function GET(req: NextRequest) {
     const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
     if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

     const { data, error } = await supabaseAdmin
       .from('<table>')
       .select('*')
       .eq('company_id', companyId)
       .eq('is_deleted', false)
       .order('created_at', { ascending: false });
     if (error) return NextResponse.json({ error: error.message }, { status: 400 });
     return NextResponse.json(data ?? []);
   }

   export async function POST(req: NextRequest) {
     const body = await req.json();
     const companyId = resolveCompanyId(body.company_id);
     if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });

     const { data, error } = await supabaseAdmin
       .from('<table>')
       .insert({ ...body, company_id: companyId })
       .select('*')
       .single();
     if (error) return NextResponse.json({ error: error.message }, { status: 400 });
     return NextResponse.json(data);
   }
   ```

3. **Route ที่มี `[id]`** (`app/api/<resource>/[id]/route.ts`) ใช้แพทเทิร์นเดียวกันสำหรับ
   `GET` (single row), `PATCH`/`PUT` (update, ต้อง `.eq('company_id', companyId)` กันข้าม tenant),
   `DELETE` — **อย่า hard delete**: ให้ `update({ is_deleted: true })` แทน

4. **Join ข้อมูลตารางอื่น**: ห้ามใช้ Supabase nested select ที่ซับซ้อน — ดึง id ที่เกี่ยวข้องมาก่อน,
   query ตารางที่สองแยกด้วย `.in('id', ids)`, แล้ว map เป็น `Map` ใน memory ก่อนประกอบ response
   (ดูตัวอย่างจริงที่ `app/api/customers/route.ts`)

5. **Validation**: ใช้ `zod` เช็ค body ที่ POST/PATCH ก่อนส่งเข้า Supabase ถ้า field มีผลต่อ business
   logic (เช่น จำนวนเงิน, enum status)

6. **Error response**: เสมอเป็น `{ error: string }` เป็นภาษาไทยที่ user-facing, status code
   400 (bad request/db error) หรือ 422 (validation ไม่ผ่าน)

## ข้อควรระวัง
- ห้ามลืม `.eq('is_deleted', false)` ใน query ที่ list/get ข้อมูล
- ห้ามลืม filter `company_id` ทุก query — ไม่งั้นข้อมูลข้าม tenant รั่วได้
- ใช้ `supabaseAdmin` (service role) ฝั่ง server เท่านั้น ห้าม expose service role key ไปฝั่ง client
