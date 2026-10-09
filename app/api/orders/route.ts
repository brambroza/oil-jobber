import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/common';
import { orderBodySchema } from '@/lib/validation/orders';
import {
  enrichOrderItems,
  loadPricingContext,
  loadSalesUserNames,
  resolveDeliveryFeeStd,
  resolveDeliveryFeeSurcharge,
  resolveSalesUserId,
  validateDiscount,
  recomputeOrderProfit,
} from '@/lib/services/order-items';
import { canAccessCustomer, customerForbidden, loadCustomerScope } from '@/lib/services/customer-scope';

/** Lists orders of the caller's company with computed totals and salesperson name. */
export async function GET() {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;

  const scope = await loadCustomerScope(ctx);
  if (scope && 'error' in scope) return NextResponse.json({ error: scope.error }, { status: 400 });
  if (Array.isArray(scope) && !scope.length) return NextResponse.json([]);

  let query = supabaseAdmin
    .from('sale_orders')
    .select('*, customers(company_name), payment_conditions(name, payment_type, credit_days), sale_order_items(liters, amount, depots(code, name), refineries(name))')
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .eq('sale_order_items.is_deleted', false)
    .order('created_at', { ascending: false });
  if (Array.isArray(scope)) query = query.in('customer_id', scope);

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const salesNames = await loadSalesUserNames(ctx.companyId, (data ?? []).flatMap((r: any) => [r.sales_user_id, r.approved_by]));

  const rows = (data ?? []).map((r: any) => {
    const refineryLabels = Array.from(
      new Set(
        (r.sale_order_items ?? [])
          .map((it: any) => String(it.refineries?.name || '').trim())
          .filter(Boolean),
      ),
    );
    const depotLabels = Array.from(
      new Set(
        (r.sale_order_items ?? [])
          .map((it: any) => it.depots?.code ? `${it.depots.code}${it.depots?.name ? ` - ${it.depots.name}` : ''}` : '')
          .filter(Boolean),
      ),
    );
    // แสดงเฉพาะประเภท + จำนวนวัน เช่น "CREDIT 15 วัน" / "CASH" (ไม่เอาชื่อเงื่อนไขซ้ำ)
    const creditLabel = r.payment_conditions?.payment_type
      ? `${r.payment_conditions.payment_type}${r.payment_conditions?.credit_days ? ` ${r.payment_conditions.credit_days} วัน` : ''}`
      : (r.payment_conditions?.name ?? null);
    const goodsAmount = (r.sale_order_items ?? []).reduce((s: number, it: any) => s + Number(it.amount || 0), 0);
    const deliveryFee = Number(r.delivery_fee_amount || 0);
    const discount = Number(r.discount_amount || 0);

    return {
      ...r,
      refinery_summary: refineryLabels.join(', ') || null,
      depot_summary: depotLabels.join(', ') || null,
      selected_credit_label: creditLabel,
      sales_user_name: r.sales_user_id ? salesNames.get(r.sales_user_id) ?? null : null,
      approved_by_name: r.approved_by ? salesNames.get(r.approved_by) ?? null : null,
      total_liters: (r.sale_order_items ?? []).reduce((s: number, it: any) => s + Number(it.liters || 0), 0),
      goods_amount: goodsAmount,
      delivery_fee_amount: deliveryFee,
      discount_amount: discount,
      total_amount: Math.max(0, goodsAmount + deliveryFee - discount),
      sale_order_items: undefined,
    };
  });

  return NextResponse.json(rows);
}

/** Creates an order with server-verified prices, delivery fee and salesperson. */
export async function POST(req: NextRequest) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const { ctx } = guard;

  const parsed = parseBody(orderBodySchema, await req.json());
  if (parsed.response) return parsed.response;
  const { items, delivery_fee_std_per_liter, delivery_fee_adjust_per_liter, sales_user_id, discount_amount, ...order } = parsed.data;
  if (!(await canAccessCustomer(ctx, order.customer_id))) return customerForbidden();

  const pricing = await loadPricingContext(ctx.companyId, order.customer_id, order.payment_condition_id ?? null);
  if ('error' in pricing) return NextResponse.json({ error: pricing.error }, { status: 422 });

  const enriched = enrichOrderItems(items, pricing.ctx);
  if ('error' in enriched) return NextResponse.json({ error: enriched.error }, { status: 422 });

  const sales = await resolveSalesUserId(ctx.companyId, ctx.userId, ctx.role, sales_user_id ?? null);
  if ('error' in sales) return NextResponse.json({ error: sales.error }, { status: 422 });

  const receiveMethod = order.receive_method ?? 'PICKUP_BY_TRUCK';
  const feeStd = resolveDeliveryFeeStd(pricing.ctx, receiveMethod, enriched.items, delivery_fee_std_per_liter);
  const feeAdjust = receiveMethod === 'PICKUP_BY_TRUCK' || receiveMethod === 'PICKUP_BY_BARGE' ? 0 : Number(delivery_fee_adjust_per_liter || 0);
  // ค่าขนส่งเพิ่มส่วนกลาง: snapshot ค่าปัจจุบันของบริษัทลงบิล (0 เมื่อรับเอง) ลูกค้า/พนักงานแก้ต่อบิลไม่ได้
  const feeSurcharge = resolveDeliveryFeeSurcharge(pricing.ctx, receiveMethod);
  const discountCheck = validateDiscount(enriched.items, feeStd, feeAdjust, receiveMethod, discount_amount, feeSurcharge);
  if ('error' in discountCheck) return NextResponse.json({ error: discountCheck.error }, { status: 422 });

  const { data: created, error } = await supabaseAdmin
    .from('sale_orders')
    .insert({
      company_id: ctx.companyId,
      ...order,
      receive_method: receiveMethod,
      order_status: order.order_status ?? 'SUBMITTED',
      sales_user_id: sales.salesUserId,
      delivery_fee_std_per_liter: feeStd,
      delivery_fee_surcharge_per_liter: feeSurcharge,
      delivery_fee_adjust_per_liter: feeAdjust,
      discount_amount: discountCheck.discount,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const { error: itemError } = await supabaseAdmin
    .from('sale_order_items')
    .insert(enriched.items.map((item) => ({
      company_id: ctx.companyId,
      sale_order_id: created.id,
      created_by: ctx.userId,
      updated_by: ctx.userId,
      ...item,
    })));

  if (itemError) {
    await supabaseAdmin.from('sale_orders').update({ is_deleted: true }).eq('id', created.id);
    return NextResponse.json({ error: itemError.message }, { status: 400 });
  }

  const profit = await recomputeOrderProfit(ctx.companyId, created.id);
  if ('error' in profit) return NextResponse.json({ error: profit.error }, { status: 400 });

  const { data: fresh } = await supabaseAdmin.from('sale_orders').select('*').eq('id', created.id).single();
  return NextResponse.json(fresh ?? created);
}
