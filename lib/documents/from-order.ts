import { supabaseAdmin } from '@/lib/supabase/server';
import { loadSalesUserNames, loadStaffSignatures } from '@/lib/services/order-items';
import { round2, splitVat, VAT_MULTIPLIER } from '@/lib/services/order-pricing';
import { receiveMethodThai } from '@/lib/documents/format';
import type { OrderDocumentData, SellerInfo, DocumentItem, PaymentLine, ReceiptDocumentData } from '@/lib/documents/types';

/** Seller block for documents, from the `companies` row. */
export async function loadSellerInfo(companyId: string): Promise<SellerInfo> {
  const { data } = await supabaseAdmin
    .from('companies')
    .select('name, tax_id, branch, address, phone, email, logo_url')
    .eq('id', companyId)
    .maybeSingle();
  return {
    name: data?.name || 'บริษัท',
    branch: data?.branch ?? null,
    address: data?.address ?? null,
    tax_id: data?.tax_id ?? null,
    phone: data?.phone ?? null,
    email: data?.email ?? null,
    logo_url: data?.logo_url ?? null,
  };
}

/**
 * Loads everything a printed document needs for one order: seller, customer,
 * items with VAT breakdown, totals, payments, and the issued invoice (if any).
 */
export async function loadOrderDocumentData(companyId: string, orderId: string): Promise<OrderDocumentData | { error: string; status: number }> {
  const { data: order, error } = await supabaseAdmin
    .from('sale_orders')
    .select('*, customers(company_name, tax_id, address, phone), payment_conditions(name, payment_type, credit_days), sale_order_items(*, depots(code, name))')
    .eq('id', orderId)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .eq('sale_order_items.is_deleted', false)
    .maybeSingle();
  if (error) return { error: error.message, status: 400 };
  if (!order) return { error: 'ไม่พบคำสั่งซื้อ', status: 404 };

  const [seller, salesNames, salesSignatures, paymentsRes, invoiceRes] = await Promise.all([
    loadSellerInfo(companyId),
    loadSalesUserNames(companyId, [order.sales_user_id, order.approved_by]),
    loadStaffSignatures(companyId, [order.sales_user_id, order.approved_by]),
    supabaseAdmin
      .from('payment_transactions')
      .select('id, paid_at, amount, payment_method, reference_no, note, receipt_id')
      .eq('company_id', companyId)
      .eq('sale_order_id', orderId)
      .eq('is_deleted', false)
      .order('paid_at', { ascending: true })
      .order('created_at', { ascending: true }),
    supabaseAdmin
      .from('invoices')
      .select('invoice_no, issued_at, due_date, status')
      .eq('company_id', companyId)
      .eq('sale_order_id', orderId)
      .eq('is_deleted', false)
      .neq('status', 'CANCELLED')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const receiptIds = (paymentsRes.data ?? []).map((p) => p.receipt_id).filter(Boolean) as string[];
  const receiptNoById = new Map<string, string>();
  if (receiptIds.length) {
    const { data: receipts } = await supabaseAdmin.from('receipts').select('id, receipt_no').in('id', receiptIds);
    for (const r of receipts ?? []) receiptNoById.set(r.id, r.receipt_no);
  }

  const rawItems = (order.sale_order_items ?? []) as any[];
  const items: DocumentItem[] = rawItems.map((it, index) => {
    const litersValue = Number(it.liters || 0);
    const unitIncl = Number(it.unit_price || 0);
    const amountIncl = round2(litersValue * unitIncl);
    return {
      no: index + 1,
      product_code: String(it.product_code || ''),
      product_name: String(it.product_name || it.product_code || ''),
      depot_label: it.depots?.code ? `${it.depots.code}${it.depots?.name ? ` - ${it.depots.name}` : ''}` : null,
      liters: litersValue,
      unit_price_incl_vat: unitIncl,
      unit_price_ex_vat: Number((unitIncl / VAT_MULTIPLIER).toFixed(4)),
      amount_incl_vat: amountIncl,
      amount_ex_vat: round2(amountIncl / VAT_MULTIPLIER),
    };
  });

  const totalLiters = items.reduce((sum, it) => sum + it.liters, 0);
  const goodsIncl = round2(items.reduce((sum, it) => sum + it.amount_incl_vat, 0));
  const feeIncl = Number(order.delivery_fee_amount || 0);
  const grossBefore = round2(goodsIncl + feeIncl);
  const discountIncl = Math.min(grossBefore, Math.max(0, Number(order.discount_amount || 0)));
  const netIncl = round2(grossBefore - discountIncl);
  const { subtotal, vat } = splitVat(netIncl);
  const feeExVat = round2(feeIncl / VAT_MULTIPLIER);
  const discountExVat = round2(discountIncl / VAT_MULTIPLIER);

  const payments: PaymentLine[] = (paymentsRes.data ?? []).map((p) => ({
    paid_at: p.paid_at,
    payment_method: p.payment_method,
    reference_no: p.reference_no,
    amount: Number(p.amount || 0),
    receipt_no: p.receipt_id ? receiptNoById.get(p.receipt_id) ?? null : null,
    note: p.note,
  }));
  const paidAmount = round2(payments.reduce((sum, p) => sum + p.amount, 0));

  const pc = order.payment_conditions as any;
  const creditName = String(pc?.name || '').trim();
  const creditLabel = creditName
    ? creditName.includes('วัน') || pc?.payment_type !== 'CREDIT' || !pc?.credit_days
      ? creditName
      : `${creditName} (${pc.credit_days} วัน)`
    : null;
  const customer = order.customers as any;

  return {
    order_id: order.id,
    order_no: order.order_no || order.id.slice(0, 8),
    order_date: order.created_at,
    due_date: order.due_date,
    requested_delivery_date: order.requested_delivery_date,
    credit_label: creditLabel,
    customer_po_no: order.customer_po_no,
    sales_name: order.sales_user_id ? salesNames.get(order.sales_user_id) ?? null : null,
    sales_signature: order.sales_user_id ? salesSignatures.get(order.sales_user_id) ?? null : null,
    approver_name: order.approved_by ? salesNames.get(order.approved_by) ?? null : null,
    approver_signature: order.approved_by ? salesSignatures.get(order.approved_by) ?? null : null,
    approved_at: order.approved_at ?? null,
    approval_note: order.approval_note ?? null,
    approved_over_credit: Boolean(order.approved_over_credit),
    seller,
    customer: {
      name: customer?.company_name || '-',
      address: customer?.address ?? null,
      tax_id: customer?.tax_id ?? null,
      phone: customer?.phone ?? null,
    },
    items,
    totals: {
      total_liters: totalLiters,
      goods_incl_vat: goodsIncl,
      delivery_fee_incl_vat: feeIncl,
      delivery_fee_per_liter: round2(
        Number(order.delivery_fee_std_per_liter || 0)
        + Number(order.delivery_fee_surcharge_per_liter || 0)
        + Number(order.delivery_fee_adjust_per_liter || 0),
      ),
      gross_before_discount: grossBefore,
      discount_incl_vat: discountIncl,
      discount_ex_vat: discountExVat,
      net_incl_vat: netIncl,
      subtotal_ex_vat: subtotal,
      vat,
      goods_ex_vat: round2(goodsIncl / VAT_MULTIPLIER),
      delivery_fee_ex_vat: feeExVat,
    },
    remark: order.remark ?? null,
    discount_note: order.discount_note ?? null,
    receive_method_label: receiveMethodThai(order.receive_method),
    delivery_location: order.delivery_location ?? null,
    vehicle: order.vehicle_license_plate
      ? { license_plate: order.vehicle_license_plate, driver_name: order.vehicle_driver_name, driver_phone: order.vehicle_driver_phone }
      : null,
    invoice: invoiceRes.data
      ? { invoice_no: invoiceRes.data.invoice_no, issued_at: invoiceRes.data.issued_at, due_date: invoiceRes.data.due_date, status: invoiceRes.data.status }
      : null,
    payments,
    paid_amount: paidAmount,
    outstanding_amount: round2(netIncl - paidAmount),
  };
}

/** Loads receipt + its order for the receipt document. */
export async function loadReceiptDocumentData(companyId: string, receiptId: string): Promise<ReceiptDocumentData | { error: string; status: number }> {
  const { data: receipt, error } = await supabaseAdmin
    .from('receipts')
    .select('id, sale_order_id, receipt_no, issued_at, amount, payment_method, reference_no, payment_transaction_id')
    .eq('id', receiptId)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) return { error: error.message, status: 400 };
  if (!receipt) return { error: 'ไม่พบใบเสร็จ', status: 404 };

  const [order, paymentRes] = await Promise.all([
    loadOrderDocumentData(companyId, receipt.sale_order_id),
    supabaseAdmin
      .from('payment_transactions')
      .select('received_by')
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .or(receipt.payment_transaction_id ? `receipt_id.eq.${receiptId},id.eq.${receipt.payment_transaction_id}` : `receipt_id.eq.${receiptId}`)
      .limit(1)
      .maybeSingle(),
  ]);
  if ('error' in order) return order;
  const receiverSignatures = await loadStaffSignatures(companyId, [paymentRes.data?.received_by]);
  return {
    ...order,
    receipt: {
      receipt_no: receipt.receipt_no,
      issued_at: receipt.issued_at,
      amount: Number(receipt.amount || 0),
      payment_method: receipt.payment_method,
      reference_no: receipt.reference_no,
    },
    receiver_signature: paymentRes.data?.received_by ? receiverSignatures.get(paymentRes.data.received_by) ?? null : null,
  };
}
