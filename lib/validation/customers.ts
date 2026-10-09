import { z } from 'zod';
import { optionalText, optionalUuid } from '@/lib/validation/common';

/** Customer payload for create (all fields) and update (partial). */
export const customerBodySchema = z.object({
  company_name: z.string().trim().min(1, 'กรุณาระบุชื่อลูกค้า'),
  tax_id: optionalText(20),
  address: optionalText(1000),
  phone: optionalText(50),
  credit_limit: z.coerce.number().nonnegative().default(0),
  payment_term_days: z.coerce.number().int().nonnegative().default(0),
  payment_condition_id: optionalUuid,
  /** บาท/ลิตร รวม VAT, ค่าลบ = ส่วนลด */
  price_adjustment_per_liter: z.coerce.number().finite().default(0),
  /** ค่าธรรมเนียมที่เซลบวกเพิ่ม บาท/ลิตร (>= 0) */
  sales_fee_per_liter: z.coerce.number().nonnegative('ค่าธรรมเนียมต้องไม่ติดลบ').default(0),
  sales_user_id: optionalUuid,
  status: z.string().trim().max(50).default('ACTIVE'),
});

export const customerPatchSchema = customerBodySchema.partial();
