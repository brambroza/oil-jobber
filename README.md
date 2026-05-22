# Oil Jobber Management Platform

## Setup
1. ติดตั้ง dependencies: `npm install`
2. คัดลอกไฟล์ env: `cp .env.example .env.local`
3. ตั้งค่า Supabase/LINE/Typhoon API
4. รัน migration ที่ `supabase/migrations/20260518120000_init_oiljobber.sql`
5. รันระบบ: `npm run dev`

## Environment Variables
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`
- `NEXT_PUBLIC_LIFF_ID`
- `TYPHOON_OCR_API_KEY`
- `TYPHOON_OCR_API_URL`
- `NEXT_PUBLIC_APP_URL`

## LINE OA / LIFF
- เปิดใช้งาน Messaging API และเก็บ `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`
- สร้าง LIFF App และใส่ `NEXT_PUBLIC_LIFF_ID`
- ตั้งค่า webhook URL เป็น `/api/line/webhook`
- ตั้ง Rich Menu ให้ลิงก์เข้า `/liff/order`

## Typhoon OCR
- รับ API key จากผู้ให้บริการ
- ตั้ง `TYPHOON_OCR_API_URL` และ `TYPHOON_OCR_API_KEY`
- API route ใช้ที่ `/api/ocr/typhoon`

## Notes
- ทุกตารางธุรกิจรองรับ multi-tenant ผ่าน `company_id`
- เปิดใช้ RLS และ policy ตาม company
- มี RPC ที่จำเป็น: `calculate_oil_selling_price`, `get_dashboard_sales_summary`, `get_customer_credit_status`, `get_order_outstanding_amount`
