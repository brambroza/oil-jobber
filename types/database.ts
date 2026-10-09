export type UUID = string;

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'SALES_MANAGER' | 'SALES' | 'ACCOUNTING' | 'OPERATION' | 'OWNER';

export type OrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'ADMIN_REVIEW'
  | 'CONFIRMED'
  | 'REFINERY_BOOKED'
  | 'WAITING_PAYMENT'
  | 'PAID'
  | 'PICKUP_READY'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'CANCELLED';

export type ReceiveMethod = 'DELIVER_BY_TRUCK' | 'PICKUP_BY_TRUCK' | 'PICKUP_BY_BARGE' | 'ARRANGE_TRANSPORT';
export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CHEQUE';
export type InvoiceStatus = 'ISSUED' | 'PAID' | 'CANCELLED';

export interface BaseEntity {
  id: UUID;
  company_id: UUID;
  created_at: string;
  updated_at: string;
  created_by: UUID | null;
  updated_by: UUID | null;
  is_deleted: boolean;
}

export interface Company {
  id: UUID;
  name: string;
  tax_id: string | null;
  branch: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
  /** ค่าขนส่งเพิ่มส่วนกลาง บาท/ลิตร (รวม VAT) บวกทุกบิลที่จัดส่ง */
  delivery_fee_surcharge_per_liter: number;
}

export interface PaymentCondition extends BaseEntity { code: string; name: string; payment_type: 'CASH' | 'CREDIT'; credit_days: number; extra_cost_per_liter: number; }
export interface Depot extends BaseEntity {
  code: string;
  name: string;
  pickup_cost_per_liter: number;
  refinery_id: UUID | null;
  is_active: boolean;
  refineries?: { id: UUID; name: string } | null;
}
export interface OilProduct extends BaseEntity { code: string; name: string; color_hex: string; is_active: boolean; }
export interface PriceRuleSetting extends BaseEntity { service_fee_per_liter: number; profit_margin_per_liter: number; }

export interface Customer extends BaseEntity {
  company_name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  credit_limit: number;
  payment_term_days: number;
  payment_condition_id: UUID | null;
  /** ค่ากลางที่ admin ตั้ง: บาท/ลิตร (รวม VAT) บวก/ลบ จากราคามาตรฐาน ใช้กับทุกสินค้า */
  price_adjustment_per_liter: number;
  /** ค่าธรรมเนียมที่พนักงานขายบวกเพิ่ม บาท/ลิตร (รวม VAT, >= 0) */
  sales_fee_per_liter: number;
  sales_user_id: UUID | null;
  status: string;
}

export interface UserProfile {
  id: UUID;
  company_id: UUID;
  full_name: string | null;
  email: string | null;
  role: UserRole;
  avatar_url: string | null;
  /** ลายเซ็นพนักงาน data URI (image/png|jpeg) สำหรับเอกสาร PDF */
  signature_url?: string | null;
  created_at: string;
  updated_at: string;
  is_deleted: boolean;
}

export interface SaleOrder extends BaseEntity {
  customer_id: UUID;
  line_customer_id: UUID | null;
  order_no: string | null;
  order_status: OrderStatus;
  depot_id: UUID | null;
  payment_condition_id: UUID | null;
  delivery_location: string | null;
  refinery_booking_number: string | null;
  due_date: string | null;
  requested_delivery_date: string | null;
  customer_po_no: string | null;
  delivery_note: string | null;
  receive_method: ReceiveMethod;
  customer_vehicle_id: UUID | null;
  vehicle_license_plate: string | null;
  vehicle_driver_name: string | null;
  vehicle_driver_phone: string | null;
  vehicle_pickup_license_number: string | null;
  delivery_order_no: string | null;
  delivery_order_file_url: string | null;
  /** ค่าขนส่งมาตรฐาน บาท/ลิตร (รวม VAT) */
  delivery_fee_std_per_liter: number;
  /** ค่าขนส่งเพิ่มส่วนกลาง บาท/ลิตร (snapshot ณ เวลาสร้างบิล, 0 เมื่อรับเอง) */
  delivery_fee_surcharge_per_liter: number;
  /** ปรับค่าขนส่ง +/- บาท/ลิตร ต่อบิล */
  delivery_fee_adjust_per_liter: number;
  /** (std + surcharge + adjust) x ลิตรรวม (รวม VAT) */
  delivery_fee_amount: number;
  /** ส่วนลดท้ายบิล บาท (รวม VAT) */
  discount_amount: number;
  discount_note: string | null;
  remark: string | null;
  sales_user_id: UUID | null;
}

export interface SaleOrderItem extends BaseEntity {
  sale_order_id: UUID;
  refinery_id: UUID | null;
  depot_id: UUID | null;
  product_code: string;
  product_name: string;
  liters: number;
  /** บาท/ลิตร รวม VAT */
  unit_price: number;
  amount: number;
  base_cost_price: number | null;
  payment_extra_per_liter: number;
  /** ค่ากลาง + ค่าธรรมเนียมเซล รวมกัน */
  customer_adjust_per_liter: number;
  sales_fee_per_liter: number;
}

export interface Invoice extends BaseEntity {
  sale_order_id: UUID;
  customer_id: UUID | null;
  invoice_no: string;
  issued_at: string;
  due_date: string | null;
  status: InvoiceStatus;
  /** legacy total (kept equal to total_amount) */
  amount: number;
  goods_amount: number | null;
  delivery_fee_amount: number;
  discount_amount: number;
  subtotal_amount: number | null;
  vat_amount: number | null;
  total_amount: number | null;
  customer_name: string | null;
  customer_tax_id: string | null;
  customer_address: string | null;
  items_snapshot: InvoiceItemSnapshot[];
  issued_by: UUID | null;
}

export interface InvoiceItemSnapshot {
  product_code: string;
  product_name: string;
  liters: number;
  unit_price: number;
  amount: number;
  depot_label?: string | null;
}

export interface PaymentTransaction extends BaseEntity {
  sale_order_id: UUID;
  paid_at: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_no: string | null;
  slip_url: string | null;
  note: string | null;
  received_by: UUID | null;
  receipt_id: UUID | null;
}

export interface Receipt extends BaseEntity {
  sale_order_id: UUID;
  customer_id: UUID | null;
  payment_transaction_id: UUID | null;
  receipt_no: string;
  issued_at: string;
  amount: number;
  payment_method: PaymentMethod | null;
  reference_no: string | null;
  customer_name: string | null;
  customer_tax_id: string | null;
  customer_address: string | null;
}
