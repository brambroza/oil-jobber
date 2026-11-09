import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/common';
import { invoicePatchSchema } from '@/lib/validation/accounting';
import { canAccessOrder, customerForbidden, isScopedRole } from '@/lib/services/customer-scope';
import type { StaffContext } from '@/lib/auth/api-guard';
import { todayBangkok } from '@/lib/services/quotations';
import { validateInvoiceIssueDate } from '@/lib/utils/invoice-dates';
import { buildInvoiceContent, invoiceItemsFromSnapshot } from '@/lib/utils/invoice-content';
import { loadOrderDocumentData } from '@/lib/documents/from-order';
import type { DocumentTotals } from '@/lib/documents/types';
import { invoiceContentColumns } from '@/lib/services/invoice-content';

/**
 * Invoice with its editable content: the stored edit when the invoice was
 * edited, otherwise what the PDF prints now (the live sale order).
 */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;
  if (!(await canAccessInvoice(ctx, id))) return customerForbidden();

  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .select('*')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!invoice) return NextResponse.json({ error: 'ไม่พบใบกำกับภาษี' }, { status: 404 });

  const doc = await loadOrderDocumentData(ctx.companyId, String(invoice.sale_order_id));
  if ('error' in doc) return NextResponse.json({ error: doc.error }, { status: doc.status });

  const edited = Boolean(invoice.content_overridden);
  const totals = (invoice.totals_snapshot ?? null) as Partial<DocumentTotals> | null;
  const content = edited
    ? {
      customer_name: invoice.customer_name || doc.customer.name,
      customer_tax_id: invoice.customer_tax_id ?? null,
      customer_address: invoice.customer_address ?? null,
      customer_phone: invoice.customer_phone ?? null,
      note: invoice.note ?? null,
      discount_amount: Number(totals?.discount_incl_vat ?? invoice.discount_amount ?? 0),
      items: invoiceItemsFromSnapshot(invoice.items_snapshot),
    }
    : {
      customer_name: doc.customer.name,
      customer_tax_id: doc.customer.tax_id,
      customer_address: doc.customer.address,
      customer_phone: doc.customer.phone,
      note: doc.remark,
      discount_amount: doc.totals.discount_incl_vat,
      items: invoiceItemsFromSnapshot(doc.items),
    };
  return NextResponse.json({
    invoice,
    content_overridden: edited,
    content,
    price_vat_mode: doc.price_vat_mode,
    order_no: doc.order_no,
    order_total: doc.totals.net_incl_vat,
  });
}

/** SALES may only touch invoices of their own customers. */
async function canAccessInvoice(ctx: StaffContext, invoiceId: string): Promise<boolean> {
  if (!isScopedRole(ctx.role)) return true;
  const { data } = await supabaseAdmin.from('invoices').select('sale_order_id').eq('id', invoiceId).eq('company_id', ctx.companyId).maybeSingle();
  return canAccessOrder(ctx, data?.sale_order_id ?? null);
}

/**
 * Allowed changes on an issued invoice: cancellation, due date, issue date,
 * the bill's VAT type (`price_vat_mode`, stored on the sale order so the
 * invoice PDF and the order's other documents stay consistent) and the
 * printed `content` (customer, lines, discount, note; stored on the invoice
 * and printed instead of the order). None of these can be changed on a
 * cancelled invoice; the issue date must pass `validateInvoiceIssueDate` and
 * the due date must not be before it.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;

  const parsed = parseBody(invoicePatchSchema, await req.json());
  if (parsed.response) return parsed.response;
  if (!(await canAccessInvoice(ctx, id))) return customerForbidden();

  const update: Record<string, unknown> = { updated_by: ctx.userId };
  if (parsed.data.status) update.status = parsed.data.status;
  if (parsed.data.due_date !== undefined) update.due_date = parsed.data.due_date;

  let saleOrderId: string | null = null;
  if (parsed.data.issued_at !== undefined || parsed.data.due_date !== undefined || parsed.data.price_vat_mode !== undefined || parsed.data.content) {
    const { data: current, error: currentError } = await supabaseAdmin
      .from('invoices')
      .select('invoice_no, status, issued_at, due_date, sale_order_id')
      .eq('id', id)
      .eq('company_id', ctx.companyId)
      .eq('is_deleted', false)
      .maybeSingle();
    if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
    if (!current) return NextResponse.json({ error: 'ไม่พบใบกำกับภาษี' }, { status: 404 });
    if (current.status === 'CANCELLED') return NextResponse.json({ error: 'ใบกำกับภาษีถูกยกเลิกแล้ว แก้ไขไม่ได้' }, { status: 422 });
    saleOrderId = current.sale_order_id ? String(current.sale_order_id) : null;

    const issuedAt = parsed.data.issued_at ?? String(current.issued_at);
    const dueDate = parsed.data.due_date !== undefined ? parsed.data.due_date : current.due_date;
    const dateError = parsed.data.issued_at !== undefined
      ? validateInvoiceIssueDate(issuedAt, { today: todayBangkok(), invoiceNo: current.invoice_no, dueDate })
      : (dueDate && dueDate < issuedAt ? 'วันครบกำหนดต้องไม่ก่อนวันที่ออกใบกำกับภาษี' : null);
    if (dateError) return NextResponse.json({ error: dateError }, { status: 422 });
    if (parsed.data.issued_at !== undefined) update.issued_at = parsed.data.issued_at;
  }

  if (parsed.data.content) {
    const c = parsed.data.content;
    const built = buildInvoiceContent(
      c.items.map((it) => ({ ...it, depot_label: it.depot_label ?? null })),
      c.discount_amount,
    );
    Object.assign(update, invoiceContentColumns({
      customer: { name: c.customer_name, tax_id: c.customer_tax_id ?? null, address: c.customer_address ?? null, phone: c.customer_phone ?? null },
      items: built.items,
      totals: built.totals,
      note: c.note ?? null,
    }), { content_overridden: true });
  }

  if (parsed.data.price_vat_mode !== undefined && saleOrderId) {
    const { error: orderError } = await supabaseAdmin
      .from('sale_orders')
      .update({ price_vat_mode: parsed.data.price_vat_mode, updated_by: ctx.userId })
      .eq('id', saleOrderId)
      .eq('company_id', ctx.companyId)
      .eq('is_deleted', false);
    if (orderError) return NextResponse.json({ error: orderError.message }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('invoices')
    .update(update)
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

/** Soft-deletes (voids) an invoice. */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { id } = await params;
  if (!(await canAccessInvoice(guard.ctx, id))) return customerForbidden();
  const { error } = await supabaseAdmin
    .from('invoices')
    .update({ is_deleted: true, status: 'CANCELLED', updated_by: guard.ctx.userId })
    .eq('id', id)
    .eq('company_id', guard.ctx.companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
