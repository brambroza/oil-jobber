import { z } from 'zod';
import { dateYmd, uuid } from '@/lib/validation/common';

/** First day of the current month (Bangkok). */
export function defaultFrom(): string {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Today (Bangkok). */
export function defaultTo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}

const rangeSchema = z.object({
  from: dateYmd.optional(),
  to: dateYmd.optional(),
});

export const customerPurchasesQuerySchema = rangeSchema.extend({ customer_id: uuid });

export const salesSummaryQuerySchema = rangeSchema.extend({
  group_by: z.enum(['customer', 'product', 'sales']).default('customer'),
});

/** Validates the range: ≤ 366 days, from ≤ to. */
export function normalizeRange(from?: string, to?: string): { from: string; to: string } | { error: string } {
  const f = from || defaultFrom();
  const t = to || defaultTo();
  if (f > t) return { error: 'วันที่เริ่มต้องไม่เกินวันที่สิ้นสุด' };
  const days = (new Date(`${t}T00:00:00Z`).getTime() - new Date(`${f}T00:00:00Z`).getTime()) / 86400000;
  if (days > 366) return { error: 'ช่วงวันที่ต้องไม่เกิน 1 ปี' };
  return { from: f, to: t };
}
