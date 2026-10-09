import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/common';
import { invoicePatchSchema } from '@/lib/validation/accounting';
import { canAccessOrder, customerForbidden, isScopedRole } from '@/lib/services/customer-scope';
import type { StaffContext } from '@/lib/auth/api-guard';

/** SALES may only touch invoices of their own customers. */
async function canAccessInvoice(ctx: StaffContext, invoiceId: string): Promise<boolean> {
  if (!isScopedRole(ctx.role)) return true;
  const { data } = await supabaseAdmin.from('invoices').select('sale_order_id').eq('id', invoiceId).eq('company_id', ctx.companyId).maybeSingle();
  return canAccessOrder(ctx, data?.sale_order_id ?? null);
}

/** Only cancellation and due-date changes are allowed on an issued invoice. */
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
