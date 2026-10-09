import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { callTyphoonOCR } from '@/lib/services/typhoon-ocr';

export async function POST(req: NextRequest) {
  const guard = await requireStaff('ocr');
  if (guard.response) return guard.response;
  try {
    const { base64Image } = await req.json();
    if (!base64Image || typeof base64Image !== 'string') {
      return NextResponse.json({ error: 'ต้องส่งค่า base64Image' }, { status: 422 });
    }
    const data = await callTyphoonOCR(base64Image);
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
