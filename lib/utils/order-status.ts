import type { OrderStatus } from '@/types/database';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'ร่าง',
  SUBMITTED: 'ส่งคำสั่งซื้อ',
  ADMIN_REVIEW: 'รอตรวจสอบ',
  CONFIRMED: 'ยืนยันแล้ว',
  REFINERY_BOOKED: 'จองโรงกลั่นแล้ว',
  WAITING_PAYMENT: 'รอชำระเงิน',
  PAID: 'ชำระแล้ว',
  PICKUP_READY: 'พร้อมรับสินค้า',
  DELIVERING: 'กำลังจัดส่ง',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก',
};

/** Thai label for an order status (falls back to the raw code). */
export function statusThai(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderStatus] || status;
}

/** MUI chip color for an order status. */
export function statusColor(status: string): 'default' | 'warning' | 'success' | 'error' | 'info' {
  if (['COMPLETED', 'PAID'].includes(status)) return 'success';
  if (status === 'CANCELLED') return 'error';
  if (['SUBMITTED', 'ADMIN_REVIEW', 'WAITING_PAYMENT'].includes(status)) return 'warning';
  return 'info';
}
