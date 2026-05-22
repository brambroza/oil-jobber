import { NextRequest, NextResponse } from 'next/server';
import { pushLineMessage } from '@/lib/services/line';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { lineUserId, bookingNo } = await req.json();
  await pushLineMessage(lineUserId, `ยืนยันคำสั่งซื้อ #${id} เลขจองโรงกลั่น: ${bookingNo}`);
  return NextResponse.json({ ok: true });
}
