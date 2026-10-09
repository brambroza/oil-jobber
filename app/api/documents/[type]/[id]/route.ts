import { NextRequest, NextResponse } from 'next/server';
import { requireStaff, type StaffContext } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { canAccessOrder, customerForbidden, isScopedRole } from '@/lib/services/customer-scope';
import { DOCUMENT_TYPES, generateDocumentPdf } from '@/lib/services/documents';
import type { DocumentType } from '@/lib/documents/types';

export const runtime = 'nodejs';

/** Resolves the order behind a document id and checks the SALES customer scope. */
async function canAccessDocument(ctx: StaffContext, type: DocumentType, id: string): Promise<boolean> {
  if (!isScopedRole(ctx.role)) return true;
  if (type !== 'receipt') return canAccessOrder(ctx, id);
  const { data } = await supabaseAdmin.from('receipts').select('sale_order_id').eq('id', id).eq('company_id', ctx.companyId).maybeSingle();
  return canAccessOrder(ctx, data?.sale_order_id ?? null);
}

/**
 * Streams a PDF document. `?download=1` forces a download, `?copy=1` prints
 * the tax invoice as สำเนา.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { type, id } = await params;
  if (!DOCUMENT_TYPES.includes(type as DocumentType)) return NextResponse.json({ error: 'ไม่รู้จักประเภทเอกสาร' }, { status: 404 });
  if (!(await canAccessDocument(guard.ctx, type as DocumentType, id))) return customerForbidden();

  const copy = req.nextUrl.searchParams.get('copy') === '1';
  const download = req.nextUrl.searchParams.get('download') === '1';
  const doc = await generateDocumentPdf(guard.ctx.companyId, type as DocumentType, id, { copy });
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
