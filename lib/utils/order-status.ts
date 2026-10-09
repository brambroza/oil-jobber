import type { OrderStatus } from '@/types/database';

/** Lifecycle order of statuses (CANCELLED last, reachable from most steps). */
export const ORDER_STATUS_ORDER: OrderStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'ADMIN_REVIEW',
  'CONFIRMED',
  'PO_SENT',
  'REFINERY_BOOKED',
  'WAITING_PAYMENT',
  'PAID',
  'PICKUP_READY',
  'DELIVERING',
  'DOCS_SENT',
  'DELIVERED',
  'COMPLETED',
  'CANCELLED',
];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  DRAFT: 'ร่าง',
  SUBMITTED: 'ส่งคำสั่งซื้อ',
  ADMIN_REVIEW: 'รอตรวจสอบ',
  CONFIRMED: 'ยืนยันแล้ว',
  PO_SENT: 'ส่งใบสั่งซื้อให้ลูกค้าแล้ว',
  REFINERY_BOOKED: 'จองโรงกลั่นแล้ว',
  WAITING_PAYMENT: 'รอชำระเงิน',
  PAID: 'ชำระแล้ว',
  PICKUP_READY: 'พร้อมรับสินค้า',
  DELIVERING: 'กำลังจัดส่ง',
  DOCS_SENT: 'ส่งใบส่งของ/ใบกำกับให้ลูกค้าแล้ว',
  DELIVERED: 'ส่งของแล้ว',
  COMPLETED: 'เสร็จสิ้น',
  CANCELLED: 'ยกเลิก',
};

/** Thai label for an order status (falls back to the raw code). */
export function statusThai(status: string): string {
  return ORDER_STATUS_LABELS[status as OrderStatus] || status;
}

/** MUI chip color for an order status. */
export function statusColor(status: string): 'default' | 'warning' | 'success' | 'error' | 'info' {
  if (['COMPLETED', 'PAID', 'DELIVERED'].includes(status)) return 'success';
  if (status === 'CANCELLED') return 'error';
  if (['SUBMITTED', 'ADMIN_REVIEW', 'WAITING_PAYMENT'].includes(status)) return 'warning';
  return 'info';
}

/** Actions that move an order forward automatically. */
export type OrderMilestone = 'PO_SENT' | 'DOCS_SENT' | 'DELIVERED';

/**
 * Current statuses from which each milestone action advances the order to the
 * milestone status. Outside these the action only stamps its timestamp, so the
 * status never moves backwards (e.g. a tax invoice sent while WAITING_PAYMENT
 * leaves the status for the payment RPC to advance).
 */
export const AUTO_ADVANCE: Record<OrderMilestone, OrderStatus[]> = {
  PO_SENT: ['CONFIRMED'],
  DOCS_SENT: ['PAID', 'PICKUP_READY', 'DELIVERING'],
  DELIVERED: ['CONFIRMED', 'PO_SENT', 'REFINERY_BOOKED', 'WAITING_PAYMENT', 'PAID', 'PICKUP_READY', 'DELIVERING', 'DOCS_SENT'],
};

/** Statuses in which a delivery may be recorded at all. */
export const DELIVERY_RECORDABLE_STATUSES: OrderStatus[] = [...AUTO_ADVANCE.DELIVERED, 'DELIVERED'];

/** Timestamp column stamped on `sale_orders` by each milestone. */
export const MILESTONE_TIMESTAMP_COLUMN: Record<OrderMilestone, 'po_sent_at' | 'documents_sent_at' | 'delivered_at'> = {
  PO_SENT: 'po_sent_at',
  DOCS_SENT: 'documents_sent_at',
  DELIVERED: 'delivered_at',
};

/** Status the order should move to after `action`, or null to keep the current one. */
export function nextStatusAfter(action: OrderMilestone, current: string): OrderStatus | null {
  return AUTO_ADVANCE[action].includes(current as OrderStatus) ? action : null;
}
