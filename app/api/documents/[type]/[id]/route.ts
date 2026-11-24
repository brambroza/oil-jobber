import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { customerForbidden } from '@/lib/services/customer-scope';
import { canAccessDocument } from '@/lib/services/document-access';
import { DOCUMENT_TYPES, generateDocumentPdf } from '@/lib/services/documents';
import type { DocumentType } from '@/lib/documents/types';
import { parseOptionalVatMode } from '@/lib/documents/vat-mode';

export const runtime = 'nodejs';

/**
 * Streams a PDF document. `?download=1` forces a download, `?copy=1` prints
 * the tax invoice as สำเนา, `?vat=excl|incl` overrides the bill's saved price mode.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { type, id } = await params;
  if (!DOCUMENT_TYPES.includes(type as DocumentType)) return NextResponse.json({ error: 'ไม่รู้จักประเภทเอกสาร' }, { status: 404 });
  if (!(await canAccessDocument(guard.ctx, type as DocumentType, id))) return customerForbidden();

  const copy = req.nextUrl.searchParams.get('copy') === '1';
  const download = req.nextUrl.searchParams.get('download') === '1';
  const vatMode = parseOptionalVatMode(req.nextUrl.searchParams.get('vat'));
  const doc = await generateDocumentPdf(guard.ctx.companyId, type as DocumentType, id, { copy, vatMode });
  if ('error' in doc) return NextResponse.json({ error: doc.error }, { status: doc.status });

  return new NextResponse(new Uint8Array(doc.buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(doc.filename)}`,
      'Cache-Control': 'no-store',
    },
  });
}
