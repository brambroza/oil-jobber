import { NextResponse } from 'next/server';
import { resolveDocumentShortLink } from '@/lib/services/short-links';

export const runtime = 'nodejs';

/** Short document link sent on LINE: /d/<code> redirects to the stored PDF. */
export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const url = await resolveDocumentShortLink(code);
  if (!url) {
    return new NextResponse('ไม่พบเอกสาร หรือลิงก์ไม่ถูกต้อง', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  return NextResponse.redirect(url, 302);
}
