import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { customerForbidden } from '@/lib/services/customer-scope';
import { canAccessDocument } from '@/lib/services/document-access';
import { createDocumentLink, DOCUMENT_TYPES } from '@/lib/services/documents';
import type { DocumentType } from '@/lib/documents/types';
import { parseOptionalVatMode } from '@/lib/documents/vat-mode';
import { resolveSiteOrigin } from '@/lib/services/payment-slip';

export const runtime = 'nodejs';

/**
 * Creates the customer link of a document (same link the LINE send uses)
 * without sending anything, for the "คัดลอกลิงก์" button. Does not advance
 * the order status. Optional JSON body `{ vat_mode: 'excl' | 'incl' }`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { type, id } = await params;
  if (!DOCUMENT_TYPES.includes(type as DocumentType)) return NextResponse.json({ error: 'ไม่รู้จักประเภทเอกสาร' }, { status: 404 });
  if (!(await canAccessDocument(guard.ctx, type as DocumentType, id))) return customerForbidden();

  const body = await req.json().catch(() => null) as { vat_mode?: unknown } | null;
  const vatMode = parseOptionalVatMode(body?.vat_mode);

  try {
    const result = await createDocumentLink(guard.ctx.companyId, type as DocumentType, id, guard.ctx.userId, {
      vatMode,
      origin: resolveSiteOrigin(new URL(req.url).origin),
    });
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, url: result.url, docNo: result.doc.docNo });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
