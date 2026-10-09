import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { pushLineMessage } from '@/lib/services/line';

export async function POST(req: NextRequest) {
  const guard = await requireStaff('line');
  if (guard.response) return guard.response;
  try {
    const { lineUserId, text } = await req.json();
    await pushLineMessage(lineUserId, text);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
