'use client';

import { OutstandingTable } from '@/components/accounting/OutstandingTable';

export default function OutstandingPage() {
  return <OutstandingTable title='ยอดค้างชำระ' description='บิลที่ยังรับชำระไม่ครบ กดรับชำระเพื่อบันทึกและออกใบเสร็จ' endpoint='/api/accounting/outstanding' />;
}
