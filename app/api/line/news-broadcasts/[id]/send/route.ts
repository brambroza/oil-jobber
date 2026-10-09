import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { sendLineNewsBroadcast } from '@/lib/services/line-news';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('line');
  if (guard.response) return guard.response;
  const { id } = await params;

  try {
    const result = await sendLineNewsBroadcast(id);
    return NextResponse.json({ send_result: result }, { status: result.ok ? 200 : 207 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
