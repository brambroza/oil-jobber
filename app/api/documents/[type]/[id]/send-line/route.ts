import { NextResponse } from 'next/server';
import { requireStaff, type StaffContext } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { canAccessOrder, customerForbidden, isScopedRole } from '@/lib/services/customer-scope';
import { DOCUMENT_TYPES, sendDocumentToLine } from '@/lib/services/documents';
import type { DocumentType } from '@/lib/documents/types';

export const runtime = 'nodejs';

/** Resolves the order behind a document id and checks the SALES customer scope. */
async function canAccessDocument(ctx: StaffContext, type: DocumentType, id: string): Promise<boolean> {
  if (!isScopedRole(ctx.role)) return true;
  if (type !== 'receipt') return canAccessOrder(ctx, id);
  const { data } = await supabaseAdmin.from('receipts').select('sale_order_id').eq('id', id).eq('company_id', ctx.companyId).maybeSingle();
  return canAccessOrder(ctx, data?.sale_order_id ?? null);
}

/** Generates the PDF, stores it, and sends a LINE message with the file link to the customer. */
export async function POST(_: Request, { params }: { params: Promise<{ type: string; id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { type, id } = await params;
  if (!DOCUMENT_TYPES.includes(type as DocumentType)) return NextResponse.json({ error: 'ไม่รู้จักประเภทเอกสาร' }, { status: 404 });
  if (!(await canAccessDocument(guard.ctx, type as DocumentType, id))) return customerForbidden();

  try {
    const result = await sendDocumentToLine(guard.ctx.companyId, type as DocumentType, id);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
