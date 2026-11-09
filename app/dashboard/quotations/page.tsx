import OrdersWorkspace from '@/components/orders/OrdersWorkspace';

/** เมนูใบเสนอราคา: เสนอราคาก่อน แล้วแปลงเป็นใบสั่งขายเมื่อลูกค้าอนุมัติ. */
export default function QuotationsPage() {
  return <OrdersWorkspace mode="quotation" />;
}
