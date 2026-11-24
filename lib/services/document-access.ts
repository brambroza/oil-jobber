import { supabaseAdmin } from '@/lib/supabase/server';
import type { StaffContext } from '@/lib/auth/api-guard';
import { canAccessOrder, isScopedRole } from '@/lib/services/customer-scope';
import type { DocumentType } from '@/lib/documents/types';

/**
 * Finds the sale order behind a document id: receipts by receipt id, tax
 * invoices by invoice id, delivery records by trip id; any other id (and an
 * id that is not one of those) is taken as the order id itself.
 *
 * @param companyId - tenant scope
 * @param type - document type
 * @param id - id from the document URL
 */
export async function resolveDocumentOrderId(companyId: string, type: DocumentType, id: string): Promise<string | null> {
  const table = type === 'receipt' ? 'receipts' : type === 'tax-invoice' ? 'invoices' : type === 'delivery-record' ? 'sale_order_deliveries' : null;
  if (!table) return id;
  const { data } = await supabaseAdmin.from(table).select('sale_order_id').eq('id', id).eq('company_id', companyId).maybeSingle();
  if (data?.sale_order_id) return String(data.sale_order_id);
  return type === 'receipt' ? null : id;
}

/**
 * Checks the SALES customer scope for a document (PDF, LINE send, link).
 * @param ctx - staff context
 * @param type - document type
 * @param id - id from the document URL
 */
export async function canAccessDocument(ctx: StaffContext, type: DocumentType, id: string): Promise<boolean> {
  if (!isScopedRole(ctx.role)) return true;
  return canAccessOrder(ctx, await resolveDocumentOrderId(ctx.companyId, type, id));
}
