import { z } from 'zod';
import { dateYmd, optionalText, optionalUuid, uuid } from '@/lib/validation/common';

export const ORDER_STATUSES = [
  'DRAFT', 'SUBMITTED', 'ADMIN_REVIEW', 'CONFIRMED', 'PO_SENT', 'REFINERY_BOOKED', 'WAITING_PAYMENT',
  'PAID', 'PICKUP_READY', 'DELIVERING', 'DOCS_SENT', 'DELIVERED', 'COMPLETED', 'CANCELLED',
] as const;

export const RECEIVE_METHODS = ['DELIVER_BY_TRUCK', 'PICKUP_BY_TRUCK', 'PICKUP_BY_BARGE', 'ARRANGE_TRANSPORT'] as const;

const nullableDate = z.preprocess((v) => (v === '' ? null : v), dateYmd.nullable().optional());

/** One order line as sent by the dashboard / portal. */
export const orderItemSchema = z.object({
  refinery_id: optionalUuid,
  depot_id: optionalUuid,
  product_code: z.string().trim().min(1, 'กรุณาเลือกสินค้า'),
  product_name: z.string().trim().min(1),
  liters: z.coerce.number().positive('ปริมาณต้องมากกว่า 0'),
  unit_price: z.coerce.number().nonnegative(),
  base_cost_price: z.coerce.number().nonnegative().nullable().optional(),
});

/** Full order payload for create. */
export const orderBodySchema = z.object({
  customer_id: uuid,
  order_status: z.enum(ORDER_STATUSES).optional(),
  payment_condition_id: optionalUuid,
  due_date: nullableDate,
  delivery_location: optionalText(500),
  refinery_booking_number: optionalText(100),
  delivery_order_no: optionalText(100),
  delivery_order_file_url: optionalText(1000),
  receive_method: z.enum(RECEIVE_METHODS).optional(),
  requested_delivery_date: nullableDate,
  customer_po_no: optionalText(100),
  customer_vehicle_id: optionalUuid,
  vehicle_license_plate: optionalText(50),
  vehicle_driver_name: optionalText(200),
  vehicle_driver_phone: optionalText(50),
  vehicle_pickup_license_number: optionalText(100),
  remark: optionalText(2000),
  sales_user_id: optionalUuid,
  delivery_fee_std_per_liter: z.coerce.number().nonnegative().optional(),
  delivery_fee_adjust_per_liter: z.coerce.number().optional(),
  /** ส่วนลดท้ายบิล บาท (รวม VAT) */
  discount_amount: z.coerce.number().nonnegative('ส่วนลดต้องไม่ติดลบ').optional(),
  discount_note: optionalText(300),
  items: z.array(orderItemSchema).min(1, 'กรุณาเพิ่มรายการน้ำมันอย่างน้อย 1 รายการ'),
});

/** Partial payload for update; every field optional, items may be omitted. */
export const orderPatchSchema = orderBodySchema.partial().extend({
  items: z.array(orderItemSchema).min(1, 'กรุณาเพิ่มรายการน้ำมันอย่างน้อย 1 รายการ').optional(),
});

export type OrderBodyInput = z.infer<typeof orderBodySchema>;
export type OrderPatchInput = z.infer<typeof orderPatchSchema>;

/** ISO datetime, or '' → undefined (defaults to now on the server). */
const optionalDateTime = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().datetime({ offset: true, message: 'รูปแบบวันเวลาไม่ถูกต้อง' }).optional(),
);

/** Payload for recording a delivery (บันทึกการส่งของ). */
export const deliveryRecordSchema = z.object({
  delivered_at: optionalDateTime,
  delivery_receiver_name: optionalText(200),
  delivery_record_note: optionalText(1000),
});

export type DeliveryRecordInput = z.infer<typeof deliveryRecordSchema>;

/** POST /api/orders/[id]/quotation */
export const issueQuotationSchema = z.object({
  valid_until: z.union([dateYmd, z.literal(''), z.null()])
    .optional()
    .transform((value): string | null | undefined => (value === '' ? null : value)),
  note: optionalText(1000),
  /** ออกใหม่: ยกเลิกใบเสนอราคาเดิมของใบสั่งขายนี้แล้วออกเลขใหม่ */
  reissue: z.boolean().optional(),
});
