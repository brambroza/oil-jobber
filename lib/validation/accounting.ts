import { z } from 'zod';
import { dateYmd, optionalText, uuid } from '@/lib/validation/common';

export const PAYMENT_METHODS = ['CASH', 'TRANSFER', 'CHEQUE'] as const;

/** POST /api/accounting/payment */
export const recordPaymentSchema = z.object({
  sale_order_id: uuid,
  amount: z.coerce.number().positive('จำนวนเงินต้องมากกว่า 0'),
  paid_at: z.preprocess((v) => (v === '' ? undefined : v), dateYmd.optional()),
  payment_method: z.enum(PAYMENT_METHODS).default('CASH'),
  reference_no: optionalText(100),
  slip_url: optionalText(1000),
  note: optionalText(1000),
  issue_receipt: z.boolean().default(true),
});

/** One printed line of an edited tax invoice (unit price incl. VAT, delivery fee folded in). */
export const invoiceContentItemSchema = z.object({
  product_code: z.string().trim().min(1, 'กรุณาระบุรหัสสินค้า').max(50),
  product_name: z.string().trim().min(1, 'กรุณาระบุชื่อสินค้า').max(200),
  depot_label: optionalText(200),
  liters: z.number({ invalid_type_error: 'จำนวนลิตรต้องเป็นตัวเลข' }).positive('จำนวนลิตรต้องมากกว่า 0').max(10_000_000),
  unit_price_incl_vat: z.number({ invalid_type_error: 'ราคาต้องเป็นตัวเลข' }).min(0, 'ราคาต้องไม่ติดลบ').max(100_000),
});

/** Edited content of a tax invoice: customer block, lines, discount and note. */
export const invoiceContentSchema = z.object({
  customer_name: z.string().trim().min(1, 'กรุณาระบุชื่อลูกค้า').max(300),
  customer_tax_id: optionalText(20),
  customer_address: optionalText(1000),
  customer_phone: optionalText(50),
  note: optionalText(1000),
  discount_amount: z.number({ invalid_type_error: 'ส่วนลดต้องเป็นตัวเลข' }).min(0, 'ส่วนลดต้องไม่ติดลบ').max(100_000_000),
  items: z.array(invoiceContentItemSchema).min(1, 'ต้องมีรายการอย่างน้อย 1 รายการ').max(50, 'รายการเกิน 50 รายการ'),
});

/** PATCH /api/accounting/invoice/[id] */
export const invoicePatchSchema = z.object({
  status: z.enum(['CANCELLED']).optional(),
  due_date: z.preprocess((v) => (v === '' ? null : v), dateYmd.nullable().optional()),
  /** วันที่ออกใบกำกับภาษี (แก้ย้อนหลังได้ ภายในปีเดียวกับเลขใบกำกับ) */
  issued_at: dateYmd.optional(),
  /** ประเภทภาษีของบิล: excl = ราคาไม่รวมภาษี, incl = ราคารวมภาษี (บันทึกที่ใบสั่งขาย) */
  price_vat_mode: z.enum(['excl', 'incl'], { errorMap: () => ({ message: 'ประเภทภาษีไม่ถูกต้อง' }) }).optional(),
  /** แก้ข้อมูลที่พิมพ์บนใบกำกับ (ลูกค้า รายการ ส่วนลด หมายเหตุ) */
  content: invoiceContentSchema.optional(),
});

/** POST /api/accounting/invoice/from-order/[orderId] */
export const invoiceIssueSchema = z.object({
  /** วันที่ออกใบกำกับภาษี; ไม่ระบุ = วันนี้ */
  issued_at: z.union([dateYmd, z.literal(''), z.null()])
    .optional()
    .transform((value): string | undefined => value || undefined),
});

/** PATCH /api/companies/me */
export const companyPatchSchema = z.object({
  name: z.string().trim().min(1, 'กรุณาระบุชื่อบริษัท').optional(),
  tax_id: optionalText(20),
  branch: optionalText(100),
  address: optionalText(1000),
  phone: optionalText(50),
  email: optionalText(200),
  logo_url: optionalText(1000),
  /** ค่าขนส่งเพิ่มส่วนกลาง บาท/ลิตร (รวม VAT) ≥ 0 */
  delivery_fee_surcharge_per_liter: z.coerce
    .number({ invalid_type_error: 'ค่าขนส่งเพิ่มต้องเป็นตัวเลข' })
    .nonnegative('ค่าขนส่งเพิ่มต้องไม่ติดลบ')
    .max(100, 'ค่าขนส่งเพิ่มต้องไม่เกิน 100 บาท/ลิตร')
    .optional(),
});
