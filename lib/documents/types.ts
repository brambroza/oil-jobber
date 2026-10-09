import type { PaymentMethod } from '@/types/database';

export type DocumentType = 'purchase-order' | 'tax-invoice' | 'receipt' | 'delivery-record';

export type SellerInfo = {
  name: string;
  branch: string | null;
  address: string | null;
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  logo_url: string | null;
};

export type CustomerInfo = {
  name: string;
  address: string | null;
  tax_id: string | null;
  phone: string | null;
};

export type DocumentItem = {
  no: number;
  product_code: string;
  product_name: string;
  depot_label: string | null;
  liters: number;
  /** บาท/ลิตร รวม VAT */
  unit_price_incl_vat: number;
  /** บาท/ลิตร ก่อน VAT */
  unit_price_ex_vat: number;
  /** รวม VAT */
  amount_incl_vat: number;
  /** ก่อน VAT */
  amount_ex_vat: number;
};

export type DocumentTotals = {
  total_liters: number;
  goods_incl_vat: number;
  delivery_fee_incl_vat: number;
  delivery_fee_per_liter: number;
  /** goods + fee before discount, incl. VAT */
  gross_before_discount: number;
  discount_incl_vat: number;
  discount_ex_vat: number;
  net_incl_vat: number;
  subtotal_ex_vat: number;
  vat: number;
  goods_ex_vat: number;
  delivery_fee_ex_vat: number;
};

export type PaymentLine = {
  paid_at: string;
  payment_method: PaymentMethod | string;
  reference_no: string | null;
  amount: number;
  receipt_no: string | null;
  note: string | null;
};

export type DeliveryRecordInfo = {
  record_no: string;
  delivered_at: string;
  receiver_name: string | null;
  note: string | null;
  recorded_by_name: string | null;
  /** ลายเซ็นพนักงานผู้บันทึก (data URI) ถ้ามี */
  recorded_by_signature: string | null;
};

export type OrderDocumentData = {
  order_id: string;
  order_no: string;
  order_date: string;
  due_date: string | null;
  requested_delivery_date: string | null;
  credit_label: string | null;
  customer_po_no: string | null;
  sales_name: string | null;
  /** ลายเซ็นพนักงานขาย (data URI) ถ้ามี */
  sales_signature: string | null;
  approver_name: string | null;
  approver_signature: string | null;
  approved_at: string | null;
  approval_note: string | null;
  approved_over_credit: boolean;
  seller: SellerInfo;
  customer: CustomerInfo;
  items: DocumentItem[];
  totals: DocumentTotals;
  remark: string | null;
  discount_note: string | null;
  receive_method_label: string;
  delivery_location: string | null;
  vehicle: { license_plate: string | null; driver_name: string | null; driver_phone: string | null } | null;
  invoice: { invoice_no: string; issued_at: string; due_date: string | null; status: string } | null;
  /** บันทึกการส่งของ (null until a delivery is recorded) */
  delivery: DeliveryRecordInfo | null;
  payments: PaymentLine[];
  paid_amount: number;
  outstanding_amount: number;
};

export type ReceiptDocumentData = OrderDocumentData & {
  receipt: { receipt_no: string; issued_at: string; amount: number; payment_method: string | null; reference_no: string | null };
  /** ลายเซ็นผู้รับเงิน (ผู้บันทึกการรับชำระ) ถ้ามี */
  receiver_signature: string | null;
};
