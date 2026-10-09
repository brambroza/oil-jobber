'use client';

import { OutstandingTable } from '@/components/accounting/OutstandingTable';

export default function OverduePage() {
  return <OutstandingTable title='เกินกำหนดชำระ' description='บิลค้างชำระที่เลยวันครบกำหนดแล้ว' endpoint='/api/accounting/overdue' />;
}
