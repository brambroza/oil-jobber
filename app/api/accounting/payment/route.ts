import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/common';
import { recordPaymentSchema } from '@/lib/validation/accounting';
import { loadSalesUserNames } from '@/lib/services/order-items';
import { canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';

/** Payments of one order (`?sale_order_id=`) with receipt numbers and receiver names. */
export async function GET(req: NextRequest) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const orderId = String(req.nextUrl.searchParams.get('sale_order_id') || '').trim();
  if (!orderId) return NextResponse.json({ error: 'กรุณาระบุ sale_order_id' }, { status: 422 });
  if (!(await canAccessOrder(ctx, orderId))) return customerForbidden();

  const { data, error } = await supabaseAdmin
    .from('payment_transactions')
    .select('id, sale_order_id, paid_at, amount, payment_method, reference_no, slip_url, note, received_by, receipt_id, created_at')
    .eq('company_id', ctx.companyId)
    .eq('sale_order_id', orderId)
    .eq('is_deleted', false)
    .order('paid_at', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const receiptIds = (data ?? []).map((p) => p.receipt_id).filter(Boolean) as string[];
  const [receiptsRes, names] = await Promise.all([
    receiptIds.length ? supabaseAdmin.from('receipts').select('id, receipt_no').in('id', receiptIds) : Promise.resolve({ data: [] as Array<{ id: string; receipt_no: string }> }),
    loadSalesUserNames(ctx.companyId, (data ?? []).map((p) => p.received_by)),
  ]);
  const receiptNo = new Map((receiptsRes.data ?? []).map((r) => [r.id, r.receipt_no]));

  return NextResponse.json((data ?? []).map((p) => ({
    ...p,
    receipt_no: p.receipt_id ? receiptNo.get(p.receipt_id) ?? null : null,
    received_by_name: p.received_by ? names.get(p.received_by) ?? null : null,
  })));
}

/**
 * Records a payment through the atomic `record_order_payment` RPC: validates
 * against the outstanding balance, issues a receipt, and marks the order PAID
 * when fully settled.
 */
export async function POST(req: NextRequest) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;

  const parsed = parseBody(recordPaymentSchema, await req.json());
  if (parsed.response) return parsed.response;
  const input = parsed.data;
  if (!(await canAccessOrder(ctx, input.sale_order_id))) return customerForbidden();

  const { data, error } = await supabaseAdmin.rpc('record_order_payment', {
    p_company: ctx.companyId,
    p_order: input.sale_order_id,
    p_amount: input.amount,
    p_paid_at: input.paid_at ?? null,
    p_method: input.payment_method,
    p_reference: input.reference_no ?? null,
    p_slip_url: input.slip_url ?? null,
    p_note: input.note ?? null,
    p_user: ctx.userId,
    p_issue_receipt: input.issue_receipt,
  });

  if (error) {
    const message = String(error.message || 'บันทึกการรับชำระไม่สำเร็จ');
    return NextResponse.json({ error: message }, { status: 422 });
  }
  return NextResponse.json(data);
}
