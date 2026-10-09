-- Sales-added fee per liter on top of the admin baseline price adjustment.
-- Effective per-liter adjustment = price_adjustment_per_liter (admin) + sales_fee_per_liter (sales).

alter table public.customers
  add column if not exists sales_fee_per_liter numeric(10,4) not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'customers_sales_fee_nonneg') then
    alter table public.customers
      add constraint customers_sales_fee_nonneg check (sales_fee_per_liter >= 0);
  end if;
end $$;

comment on column public.customers.sales_fee_per_liter is
  'ค่าธรรมเนียมที่พนักงานขายบวกเพิ่ม บาท/ลิตร (รวม VAT) บวกจากค่ากลางที่ admin ตั้ง ใช้ทั้งหน้าพนักงานและ LIFF';

alter table public.sale_order_items
  add column if not exists sales_fee_per_liter numeric(10,4) not null default 0;
