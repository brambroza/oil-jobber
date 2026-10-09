-- Profit snapshot per order (ก่อน VAT). Computed by the app
-- (lib/services/order-pricing.ts computeOrderProfit) whenever an order is
-- created or edited; stored so reports can read it without joining items.
--   revenue_ex_vat  = (goods + delivery fee - discount) / 1.07
--   cost_goods      = Σ liters × base_cost_price (ราคาโรงกลั่น ก่อน VAT); items without a base cost count at selling price (profit 0)
--   cost_delivery   = liters × delivery_fee_std_per_liter / 1.07 (ค่าขนส่งมาตรฐานที่ admin ตั้ง), 0 เมื่อรับเอง
--   profit          = revenue_ex_vat - cost_goods - cost_delivery
--   gp_percent      = profit / revenue_ex_vat × 100

alter table public.sale_orders
  add column if not exists revenue_ex_vat_amount numeric(14,2) not null default 0,
  add column if not exists cost_goods_amount numeric(14,2) not null default 0,
  add column if not exists cost_delivery_amount numeric(14,2) not null default 0,
  add column if not exists profit_amount numeric(14,2) not null default 0,
  add column if not exists gp_percent numeric(7,2) not null default 0,
  add column if not exists cost_incomplete boolean not null default false;

comment on column public.sale_orders.revenue_ex_vat_amount is 'รายได้ก่อน VAT = ยอดสุทธิ (น้ำมัน + ค่าขนส่ง − ส่วนลด) / 1.07';
comment on column public.sale_orders.cost_goods_amount is 'ต้นทุนน้ำมันก่อน VAT = Σ ลิตร × ราคาโรงกลั่น (base_cost_price)';
comment on column public.sale_orders.cost_delivery_amount is 'ต้นทุนขนส่งก่อน VAT = ลิตรรวม × ค่าขนส่งมาตรฐาน / 1.07 (0 เมื่อรับเอง)';
comment on column public.sale_orders.profit_amount is 'กำไร (+) / ขาดทุน (−) ก่อน VAT = รายได้ − ต้นทุนน้ำมัน − ต้นทุนขนส่ง';
comment on column public.sale_orders.gp_percent is 'GP % = กำไร / รายได้ก่อน VAT × 100';
comment on column public.sale_orders.cost_incomplete is 'true เมื่อมีรายการที่ไม่มี base_cost_price (พนักงานใส่ราคาเอง) กำไรของรายการนั้นถือเป็น 0';
