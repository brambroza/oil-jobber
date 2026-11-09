import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { callTyphoonOCR, OcrTimeoutError } from '@/lib/services/typhoon-ocr';

// OCR on a price sheet can take 10-40s; allow longer than the default serverless limit.
export const maxDuration = 60;

/** Max accepted base64 length (~6 MB decoded). Client downscales to ~2000px, usually < 1 MB. */
const MAX_BASE64_LENGTH = 8 * 1024 * 1024;

/**
 * POST /api/ocr/typhoon — run Typhoon OCR on a base64 image.
 * Body: { base64Image: string } (raw base64 or data:image/... URL)
 */
export async function POST(req: NextRequest) {
  const guard = await requireStaff('ocr');
  if (guard.response) return guard.response;
  try {
    const { base64Image } = await req.json();
    if (!base64Image || typeof base64Image !== 'string') {
      return NextResponse.json({ error: 'ต้องส่งค่า base64Image' }, { status: 422 });
    }
    if (base64Image.length > MAX_BASE64_LENGTH) {
      return NextResponse.json({ error: 'ไฟล์ภาพใหญ่เกินไป กรุณาครอปหรือถ่ายใหม่' }, { status: 413 });
    }
    const data = await callTyphoonOCR(base64Image);
    return NextResponse.json(data);
  } catch (e) {
    if (e instanceof OcrTimeoutError) {
      return NextResponse.json({ error: e.message }, { status: 504 });
    }
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
