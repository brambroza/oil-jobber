import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { pushLineMessage } from '@/lib/services/line';
import { parseBody } from '@/lib/validation/common';
import { orderPatchSchema } from '@/lib/validation/orders';
import { isPickupMethod } from '@/lib/services/order-pricing';
import {
  enrichOrderItems,
  loadPricingContext,
  loadSalesUserNames,
  resolveDeliveryFeeStd,
  resolveDeliveryFeeSurcharge,
  resolveSalesUserId,
  validateDiscount,
} from '@/lib/services/order-items';
import { canAccessCustomer, canAccessOrder, customerForbidden } from '@/lib/services/customer-scope';
import { canApproveOrders } from '@/lib/auth/permissions';

const ORDER_SELECT = '*, customers(company_name, tax_id, address, phone), payment_conditions(name, payment_type, credit_days), sale_order_items(*, refineries(id, name), depots(id, code, name))';

/** Returns one order with items, customer, payment condition and salesperson name. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;
  if (!(await canAccessOrder(ctx, id))) return customerForbidden();

  const { data, error } = await supabaseAdmin
    .from('sale_orders')
    .select(ORDER_SELECT)
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .eq('sale_order_items.is_deleted', false)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const names = await loadSalesUserNames(ctx.companyId, [data.sales_user_id, data.approved_by]);
  const goodsAmount = (data.sale_order_items ?? []).reduce((s: number, it: any) => s + Number(it.amount || 0), 0);
  return NextResponse.json({
    ...data,
    sales_user_name: data.sales_user_id ? names.get(data.sales_user_id) ?? null : null,
    approved_by_name: data.approved_by ? names.get(data.approved_by) ?? null : null,
    goods_amount: goodsAmount,
    total_amount: Math.max(0, goodsAmount + Number(data.delivery_fee_amount || 0) - Number(data.discount_amount || 0)),
  });
}

/**
 * Updates an order. Items, when sent, replace the existing lines. Setting the
 * status to PAID directly is rejected: payments go through the accounting API.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;

  const parsed = parseBody(orderPatchSchema, await req.json());
  if (parsed.response) return parsed.response;
  const { items, delivery_fee_std_per_liter, delivery_fee_adjust_per_liter, sales_user_id, discount_amount, ...orderPayload } = parsed.data;

  const { data: currentOrder, error: currentError } = await supabaseAdmin
    .from('sale_orders')
    .select('id, customer_id, order_status, payment_condition_id, receive_method, delivery_fee_std_per_liter, delivery_fee_surcharge_per_liter, delivery_fee_adjust_per_liter, discount_amount, sales_user_id, approved_by, sale_order_items(liters, unit_price, is_deleted)')
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: currentError.message }, { status: 400 });
  if (!currentOrder) return NextResponse.json({ error: 'ไม่พบคำสั่งซื้อ' }, { status: 404 });
  if (!(await canAccessCustomer(ctx, currentOrder.customer_id))) return customerForbidden();
  if (orderPayload.customer_id && orderPayload.customer_id !== currentOrder.customer_id && !(await canAccessCustomer(ctx, orderPayload.customer_id))) {
    return customerForbidden();
  }

  if (orderPayload.order_status === 'CONFIRMED' && currentOrder.order_status !== 'CONFIRMED' && !canApproveOrders(ctx.role)) {
    return NextResponse.json({ error: 'เฉพาะผู้ดูแลระบบหรือผู้จัดการฝ่ายขายเท่านั้นที่อนุมัติใบสั่งซื้อได้ (ใช้ปุ่ม "อนุมัติ")' }, { status: 422 });
  }
  if (orderPayload.order_status === 'PAID' && currentOrder.order_status !== 'PAID') {
    return NextResponse.json({ error: 'กรุณาบันทึกการรับชำระเงินผ่านเมนูบัญชี ระบบจะเปลี่ยนสถานะเป็นชำระแล้วให้อัตโนมัติ' }, { status: 422 });
  }

  const customerId = orderPayload.customer_id ?? currentOrder.customer_id;
  const paymentConditionId = orderPayload.payment_condition_id !== undefined
    ? orderPayload.payment_condition_id
    : currentOrder.payment_condition_id;
  const receiveMethod = orderPayload.receive_method ?? currentOrder.receive_method ?? 'PICKUP_BY_TRUCK';

  const pricing = await loadPricingContext(ctx.companyId, customerId, paymentConditionId ?? null);
  if ('error' in pricing) return NextResponse.json({ error: pricing.error }, { status: 422 });

  let enrichedItems: ReturnType<typeof enrichOrderItems> | null = null;
  if (items) {
    enrichedItems = enrichOrderItems(items, pricing.ctx);
    if ('error' in enrichedItems) return NextResponse.json({ error: enrichedItems.error }, { status: 422 });
  }

  const effectivePayload: Record<string, unknown> = { ...orderPayload, updated_by: ctx.userId };
  // Approver changing the status to CONFIRMED through the form still gets recorded as the approver.
  if (orderPayload.order_status === 'CONFIRMED' && currentOrder.order_status !== 'CONFIRMED' && !currentOrder.approved_by) {
    effectivePayload.approved_by = ctx.userId;
    effectivePayload.approved_at = new Date().toISOString();
  }

  if (sales_user_id !== undefined || !currentOrder.sales_user_id) {
    const sales = await resolveSalesUserId(ctx.companyId, ctx.userId, ctx.role, sales_user_id ?? currentOrder.sales_user_id ?? null);
    if ('error' in sales) return NextResponse.json({ error: sales.error }, { status: 422 });
    if (ctx.role !== 'SALES' || !currentOrder.sales_user_id) effectivePayload.sales_user_id = sales.salesUserId;
  }

  const pickup = isPickupMethod(receiveMethod);
  const itemsForFee = enrichedItems && 'items' in enrichedItems ? enrichedItems.items : [];
  if (pickup) {
    effectivePayload.delivery_fee_std_per_liter = 0;
    effectivePayload.delivery_fee_surcharge_per_liter = 0;
    effectivePayload.delivery_fee_adjust_per_liter = 0;
  } else {
    // ค่าขนส่งเพิ่มส่วนกลางเป็น snapshot ต่อบิล: คงค่าเดิมไว้ เว้นแต่บิลเปลี่ยนจากรับเองเป็นจัดส่ง
    // (หรือยังไม่เคยมีค่า) จึง snapshot ค่าปัจจุบันของบริษัท
    const storedSurcharge = currentOrder.delivery_fee_surcharge_per_liter;
    if (isPickupMethod(currentOrder.receive_method) || storedSurcharge == null) {
      effectivePayload.delivery_fee_surcharge_per_liter = resolveDeliveryFeeSurcharge(pricing.ctx, receiveMethod);
    }
    if (delivery_fee_std_per_liter !== undefined || items) {
      effectivePayload.delivery_fee_std_per_liter = resolveDeliveryFeeStd(
        pricing.ctx,
        receiveMethod,
        itemsForFee,
        delivery_fee_std_per_liter ?? (items ? null : currentOrder.delivery_fee_std_per_liter),
      );
    }
    if (delivery_fee_adjust_per_liter !== undefined) {
      effectivePayload.delivery_fee_adjust_per_liter = Number(delivery_fee_adjust_per_liter || 0);
    }
  }

  if (discount_amount !== undefined || items) {
    const itemsForDiscount = enrichedItems && 'items' in enrichedItems
      ? enrichedItems.items
      : ((currentOrder as any).sale_order_items ?? []).filter((it: any) => !it.is_deleted).map((it: any) => ({ liters: Number(it.liters || 0), unit_price: Number(it.unit_price || 0) }));
    const feeStdNow = Number(effectivePayload.delivery_fee_std_per_liter ?? currentOrder.delivery_fee_std_per_liter ?? 0);
    const feeAdjNow = Number(effectivePayload.delivery_fee_adjust_per_liter ?? currentOrder.delivery_fee_adjust_per_liter ?? 0);
    const feeSurchargeNow = Number(effectivePayload.delivery_fee_surcharge_per_liter ?? currentOrder.delivery_fee_surcharge_per_liter ?? 0);
    const discountCheck = validateDiscount(itemsForDiscount, feeStdNow, feeAdjNow, receiveMethod, discount_amount ?? currentOrder.discount_amount, feeSurchargeNow);
    if ('error' in discountCheck) return NextResponse.json({ error: discountCheck.error }, { status: 422 });
    effectivePayload.discount_amount = discountCheck.discount;
  }

  const { data, error } = await supabaseAdmin
    .from('sale_orders')
    .update(effectivePayload)
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (enrichedItems && 'items' in enrichedItems) {
    const { error: softDeleteErr } = await supabaseAdmin
      .from('sale_order_items')
      .update({ is_deleted: true, updated_by: ctx.userId })
      .eq('sale_order_id', id)
      .eq('company_id', ctx.companyId)
      .eq('is_deleted', false);
    if (softDeleteErr) return NextResponse.json({ error: softDeleteErr.message }, { status: 400 });

    const { error: itemErr } = await supabaseAdmin.from('sale_order_items').insert(
      enrichedItems.items.map((item) => ({
        company_id: ctx.companyId,
        sale_order_id: id,
        created_by: ctx.userId,
        updated_by: ctx.userId,
        ...item,
      })),
    );
    if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 });
  }

  if (orderPayload.order_status && orderPayload.order_status !== currentOrder.order_status) {
    await supabaseAdmin.from('sale_order_status_logs').insert({
      company_id: ctx.companyId,
      sale_order_id: id,
      from_status: currentOrder.order_status,
      to_status: orderPayload.order_status,
      created_by: ctx.userId,
    });
  }

  let lineWarning = '';
  const deliveryOrderNo = String(orderPayload.delivery_order_no ?? '').trim();
  const deliveryOrderFileUrl = String(orderPayload.delivery_order_file_url ?? '').trim();
  if (deliveryOrderNo || deliveryOrderFileUrl) {
    try {
      const { data: lineCustomer } = await supabaseAdmin
        .from('line_customers')
        .select('line_user_id')
        .eq('company_id', ctx.companyId)
        .eq('customer_id', data.customer_id)
        .eq('is_deleted', false)
        .maybeSingle();

      if (lineCustomer?.line_user_id) {
        const orderNo = data.order_no || data.id;
        const message = [
          `อัปเดต Delivery Order สำหรับคำสั่งซื้อ ${orderNo}`,
          deliveryOrderNo ? `DO: ${deliveryOrderNo}` : '',
          deliveryOrderFileUrl ? `เอกสาร: ${deliveryOrderFileUrl}` : '',
        ].filter(Boolean).join('\n');
        await pushLineMessage(lineCustomer.line_user_id, message);
      } else {
        lineWarning = 'ไม่พบบัญชี LINE ของลูกค้ารายนี้';
      }
    } catch (e) {
      lineWarning = `ส่ง LINE ไม่สำเร็จ: ${(e as Error).message}`;
    }
  }

  const { data: fresh } = await supabaseAdmin.from('sale_orders').select('*').eq('id', id).single();
  return NextResponse.json({ ...(fresh ?? data), line_warning: lineWarning || undefined });
}

/** Soft-deletes an order and its items. */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const { id } = await params;
  if (!(await canAccessOrder(ctx, id))) return customerForbidden();

  const { error } = await supabaseAdmin
    .from('sale_orders')
    .update({ is_deleted: true, updated_by: ctx.userId })
    .eq('id', id)
    .eq('company_id', ctx.companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabaseAdmin
    .from('sale_order_items')
    .update({ is_deleted: true, updated_by: ctx.userId })
    .eq('sale_order_id', id)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false);

  return NextResponse.json({ ok: true });
}
