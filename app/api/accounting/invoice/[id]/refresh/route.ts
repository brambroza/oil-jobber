import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';
import { loadOrderDocumentData } from '@/lib/documents/from-order';
import { invoiceContentColumns } from '@/lib/services/invoice-content';
import { uuid } from '@/lib/validation/common';

/**
 * ดึงข้อมูลล่าสุดจากใบสั่งขาย: re-snapshots the sale order into the invoice
 * (customer, lines, totals) and clears the edited flag, so the PDF prints the
 * live order again. The invoice number and dates stay the same.
 */
export async function POST(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: 'รหัสใบกำกับภาษีไม่ถูกต้อง' }, { status: 422 });

  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .select('id, sale_order_id, status')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!invoice) return NextResponse.json({ error: 'ไม่พบใบกำกับภาษี' }, { status: 404 });
  if (!(await canAccessOrder(ctx, String(invoice.sale_order_id)))) return customerForbidden();
  if (invoice.status === 'CANCELLED') return NextResponse.json({ error: 'ใบกำกับภาษีถูกยกเลิกแล้ว แก้ไขไม่ได้' }, { status: 422 });

  const doc = await loadOrderDocumentData(ctx.companyId, String(invoice.sale_order_id));
  if ('error' in doc) return NextResponse.json({ error: doc.error }, { status: doc.status });
  if (!doc.items.length) return NextResponse.json({ error: 'ใบสั่งขายไม่มีรายการสินค้า' }, { status: 422 });

  const { data, error: updateError } = await supabaseAdmin
    .from('invoices')
    .update({
      ...invoiceContentColumns({ customer: doc.customer, items: doc.items, totals: doc.totals, note: null }),
      content_overridden: false,
      updated_by: ctx.userId,
    })
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .select('*')
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 400 });
  return NextResponse.json(data);
}
