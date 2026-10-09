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

/** PATCH /api/accounting/invoice/[id] */
export const invoicePatchSchema = z.object({
  status: z.enum(['CANCELLED']).optional(),
  due_date: z.preprocess((v) => (v === '' ? null : v), dateYmd.nullable().optional()),
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
