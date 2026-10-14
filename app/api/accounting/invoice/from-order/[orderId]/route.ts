import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { loadOrderDocumentData } from '@/lib/documents/from-order';
import { canAccessCustomer, customerForbidden } from '@/lib/services/customer-scope';
import { canIssueTaxInvoice } from '@/lib/utils/order-status';

/**
 * Issues a tax invoice from an order: snapshots customer, items and totals and
 * assigns the next IV-YYMMDD#### number. One active invoice per order, and
 * only once the order has been approved.
 */
export async function POST(_: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { orderId } = await params;

  const { data: order, error: orderError } = await supabaseAdmin
    .from('sale_orders')
    .select('id, customer_id, order_status, due_date')
    .eq('id', orderId)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 400 });
  if (!order) return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 });
  if (!(await canAccessCustomer(ctx, order.customer_id))) return customerForbidden();
  if (order.order_status === 'CANCELLED') {
    return NextResponse.json({ error: 'คำสั่งซื้อถูกยกเลิกแล้ว ออกใบกำกับภาษีไม่ได้' }, { status: 422 });
  }
  if (!canIssueTaxInvoice(order.order_status)) {
    return NextResponse.json({ error: 'คำสั่งซื้อยังไม่ผ่านการอนุมัติ ต้องอนุมัติก่อนจึงออกใบกำกับภาษีได้' }, { status: 422 });
  }

  const { data: existing } = await supabaseAdmin
    .from('invoices')
    .select('id, invoice_no')
    .eq('sale_order_id', orderId)
    .eq('is_deleted', false)
    .neq('status', 'CANCELLED')
    .maybeSingle();
  if (existing) return NextResponse.json({ error: `คำสั่งซื้อนี้มีใบกำกับภาษี ${existing.invoice_no} อยู่แล้ว`, invoice: existing }, { status: 409 });

  const doc = await loadOrderDocumentData(ctx.companyId, orderId);
  if ('error' in doc) return NextResponse.json({ error: doc.error }, { status: doc.status });
  if (!doc.items.length) return NextResponse.json({ error: 'คำสั่งซื้อไม่มีรายการสินค้า' }, { status: 422 });

  const { data: invoice, error } = await supabaseAdmin
    .from('invoices')
    .insert({
      company_id: ctx.companyId,
      sale_order_id: orderId,
      customer_id: order.customer_id,
      issued_at: new Date().toISOString().slice(0, 10),
      due_date: order.due_date,
      status: doc.outstanding_amount <= 0.005 ? 'PAID' : 'ISSUED',
      amount: doc.totals.net_incl_vat,
      goods_amount: doc.totals.goods_incl_vat,
      delivery_fee_amount: doc.totals.delivery_fee_incl_vat,
      discount_amount: doc.totals.discount_incl_vat,
      subtotal_amount: doc.totals.subtotal_ex_vat,
      vat_amount: doc.totals.vat,
      total_amount: doc.totals.net_incl_vat,
      customer_name: doc.customer.name,
      customer_tax_id: doc.customer.tax_id,
      customer_address: doc.customer.address,
      items_snapshot: doc.items.map((it) => ({
        product_code: it.product_code,
        product_name: it.product_name,
        liters: it.liters,
        unit_price: it.unit_price_incl_vat,
        amount: it.amount_incl_vat,
        depot_label: it.depot_label,
      })),
      issued_by: ctx.userId,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(invoice);
}
