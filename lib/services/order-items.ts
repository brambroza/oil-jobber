import { supabaseAdmin } from '@/lib/supabase/server';
import { computeFloorUnitPrice, computeOrderProfit, computeOrderTotals, computeStandardUnitPrice, isPickupMethod, round2, type OrderProfit } from '@/lib/services/order-pricing';

export type IncomingOrderItem = {
  refinery_id?: string | null;
  depot_id?: string | null;
  product_code: string;
  product_name: string;
  liters: number;
  unit_price: number;
  base_cost_price?: number | null;
};

export type EnrichedOrderItem = {
  refinery_id: string | null;
  depot_id: string | null;
  product_code: string;
  product_name: string;
  liters: number;
  unit_price: number;
  base_cost_price: number | null;
  payment_extra_per_liter: number;
  customer_adjust_per_liter: number;
  sales_fee_per_liter: number;
};

export type PricingContext = {
  /** admin baseline + sales fee */
  customerAdjustPerLiter: number;
  /** ค่ากลางที่ admin ตั้งให้ลูกค้า (±) ใช้เป็นขั้นต่ำราคาขาย */
  adminAdjustPerLiter: number;
  salesFeePerLiter: number;
  paymentExtraPerLiter: number;
  depotTransportFees: Record<string, number>;
  /** ค่าขนส่งเพิ่มส่วนกลางของบริษัท บาท/ลิตร (รวม VAT) ณ เวลาที่โหลด */
  deliveryFeeSurchargePerLiter: number;
};

/**
 * Loads the company-wide delivery fee surcharge (บาท/ลิตร รวม VAT). Returns 0
 * when the column is missing or unset so callers never see NaN.
 */
export async function loadDeliveryFeeSurcharge(companyId: string): Promise<{ surcharge: number } | { error: string }> {
  const { data, error } = await supabaseAdmin
    .from('companies')
    .select('delivery_fee_surcharge_per_liter')
    .eq('id', companyId)
    .maybeSingle();
  if (error) return { error: error.message };
  const value = Number(data?.delivery_fee_surcharge_per_liter || 0);
  return { surcharge: Number.isFinite(value) && value > 0 ? value : 0 };
}

/**
 * Loads the server-side pricing inputs for a customer / payment condition:
 * the customer's ± adjustment, the payment condition surcharge, the
 * customer's standard transport fee per depot, and the company-wide
 * delivery fee surcharge.
 */
export async function loadPricingContext(
  companyId: string,
  customerId: string,
  paymentConditionId: string | null,
): Promise<{ ctx: PricingContext } | { error: string }> {
  const [customerRes, paymentRes, accessRes, surchargeRes] = await Promise.all([
    supabaseAdmin
      .from('customers')
      .select('id, price_adjustment_per_liter, sales_fee_per_liter')
      .eq('id', customerId)
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .maybeSingle(),
    paymentConditionId
      ? supabaseAdmin
        .from('payment_conditions')
        .select('id, extra_cost_per_liter')
        .eq('id', paymentConditionId)
        .eq('company_id', companyId)
        .eq('is_deleted', false)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabaseAdmin
      .from('customer_portal_access')
      .select('depot_transport_fees')
      .eq('customer_id', customerId)
      .eq('company_id', companyId)
      .maybeSingle(),
    loadDeliveryFeeSurcharge(companyId),
  ]);

  if (customerRes.error) return { error: customerRes.error.message };
  if (!customerRes.data) return { error: 'ไม่พบลูกค้าที่เลือก' };
  if (paymentRes.error) return { error: paymentRes.error.message };
  if (paymentConditionId && !paymentRes.data) return { error: 'ไม่พบเงื่อนไขการชำระเงินที่เลือก' };
  if (accessRes.error) return { error: accessRes.error.message };
  if ('error' in surchargeRes) return { error: surchargeRes.error };

  const fees = (accessRes.data?.depot_transport_fees ?? {}) as Record<string, unknown>;
  const depotTransportFees: Record<string, number> = {};
  for (const [depotId, value] of Object.entries(fees)) {
    const fee = Number(value || 0);
    if (Number.isFinite(fee) && fee > 0) depotTransportFees[depotId] = fee;
  }

  return {
    ctx: {
      customerAdjustPerLiter: Number(customerRes.data.price_adjustment_per_liter || 0) + Number(customerRes.data.sales_fee_per_liter || 0),
      adminAdjustPerLiter: Number(customerRes.data.price_adjustment_per_liter || 0),
      salesFeePerLiter: Number(customerRes.data.sales_fee_per_liter || 0),
      paymentExtraPerLiter: Number(paymentRes.data?.extra_cost_per_liter || 0),
      depotTransportFees,
      deliveryFeeSurchargePerLiter: surchargeRes.surcharge,
    },
  };
}

/**
 * Applies server-known pricing inputs to incoming items. When a base cost was
 * sent, the unit price must not be below the floor (standard price + admin
 * customer adjustment); any higher price is accepted and the actual markup
 * above the standard price is stored in `customer_adjust_per_liter`.
 */
export function enrichOrderItems(
  items: IncomingOrderItem[],
  ctx: PricingContext,
): { items: EnrichedOrderItem[] } | { error: string } {
  const enriched: EnrichedOrderItem[] = [];
  for (const item of items) {
    const liters = Number(item.liters || 0);
    const unitPrice = Number(item.unit_price || 0);
    const baseCost = item.base_cost_price == null ? null : Number(item.base_cost_price);

    let markupPerLiter = ctx.customerAdjustPerLiter;
    if (baseCost != null && baseCost > 0) {
      const floor = computeFloorUnitPrice(baseCost, ctx.paymentExtraPerLiter, ctx.adminAdjustPerLiter);
      if (unitPrice < floor - 0.005) {
        return { error: `ราคาต่อลิตรของ ${item.product_code} ต่ำกว่าราคากลาง (ขั้นต่ำ ${floor.toFixed(2)})` };
      }
      markupPerLiter = round2(unitPrice - computeStandardUnitPrice(baseCost, ctx.paymentExtraPerLiter));
    }

    enriched.push({
      refinery_id: item.refinery_id || null,
      depot_id: item.depot_id || null,
      product_code: String(item.product_code || '').trim(),
      product_name: String(item.product_name || '').trim(),
      liters,
      unit_price: unitPrice,
      base_cost_price: baseCost,
      payment_extra_per_liter: ctx.paymentExtraPerLiter,
      customer_adjust_per_liter: markupPerLiter,
      sales_fee_per_liter: ctx.salesFeePerLiter,
    });
  }
  return { items: enriched };
}

/**
 * Standard delivery fee per liter for an order: 0 for pickup, otherwise the
 * customer's fee for the depot of the first item (or the explicit override).
 */
export function resolveDeliveryFeeStd(
  ctx: PricingContext,
  receiveMethod: string | null | undefined,
  items: Array<{ depot_id: string | null }>,
  explicit?: number | null,
): number {
  if (isPickupMethod(receiveMethod)) return 0;
  if (explicit != null && Number.isFinite(Number(explicit))) return Number(explicit);
  const depotId = items.find((item) => item.depot_id)?.depot_id;
  return depotId ? Number(ctx.depotTransportFees[depotId] || 0) : 0;
}

/**
 * Company-wide delivery fee surcharge to snapshot on an order: 0 for pickup,
 * otherwise the current company value. Never overridable per order.
 */
export function resolveDeliveryFeeSurcharge(ctx: PricingContext, receiveMethod: string | null | undefined): number {
  if (isPickupMethod(receiveMethod)) return 0;
  return Number(ctx.deliveryFeeSurchargePerLiter || 0);
}

/**
 * Caps the bill discount at goods + delivery fee. Returns the discount to store.
 * @param feeSurcharge - company-wide surcharge per liter snapshotted on the order
 */
export function validateDiscount(
  items: Array<{ liters: number; unit_price: number }>,
  feeStd: number,
  feeAdjust: number,
  receiveMethod: string | null | undefined,
  requested: number | null | undefined,
  feeSurcharge = 0,
): { discount: number } | { error: string } {
  const discount = Math.max(0, Number(requested || 0));
  if (discount === 0) return { discount: 0 };
  const totals = computeOrderTotals({
    items,
    deliveryFeeStdPerLiter: feeStd,
    deliveryFeeSurchargePerLiter: feeSurcharge,
    deliveryFeeAdjustPerLiter: feeAdjust,
    receiveMethod,
  });
  if (discount > totals.grossBeforeDiscount + 0.005) {
    return { error: `ส่วนลดท้ายบิลต้องไม่เกินยอดบิล (${totals.grossBeforeDiscount.toFixed(2)} บาท)` };
  }
  return { discount: Math.round(discount * 100) / 100 };
}

/**
 * Validates and resolves the salesperson for an order. SALES users are always
 * recorded as themselves; other roles may pick any active staff of the company.
 */
export async function resolveSalesUserId(
  companyId: string,
  requesterId: string,
  requesterRole: string,
  requested: string | null | undefined,
): Promise<{ salesUserId: string } | { error: string }> {
  if (requesterRole === 'SALES' || !requested) return { salesUserId: requesterId };

  const { data, error } = await supabaseAdmin
    .from('users_profile')
    .select('id')
    .eq('id', requested)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!data) return { error: 'ไม่พบพนักงานขายที่เลือก' };
  return { salesUserId: data.id };
}

/** Maps `sales_user_id` → full name for a set of orders (manual join). */
/** Maps staff ids to their signature data URIs (only users that have one). */
export async function loadStaffSignatures(companyId: string, userIds: Array<string | null | undefined>): Promise<Map<string, string>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (!ids.length) return new Map();
  const { data } = await supabaseAdmin
    .from('users_profile')
    .select('id, signature_url')
    .eq('company_id', companyId)
    .in('id', ids);
  return new Map((data ?? []).filter((row) => row.signature_url).map((row) => [row.id, String(row.signature_url)]));
}

export async function loadSalesUserNames(companyId: string, salesUserIds: Array<string | null | undefined>): Promise<Map<string, string>> {
  const ids = Array.from(new Set(salesUserIds.filter((id): id is string => Boolean(id))));
  if (!ids.length) return new Map();
  const { data } = await supabaseAdmin
    .from('users_profile')
    .select('id, full_name, email')
    .eq('company_id', companyId)
    .in('id', ids);
  return new Map((data ?? []).map((row) => [row.id, String(row.full_name || row.email || '')]));
}

/**
 * Recomputes the before-VAT profit snapshot of an order from its current
 * items and delivery fee / discount settings and stores it on `sale_orders`.
 * Call after items or bill settings change.
 */
export async function recomputeOrderProfit(companyId: string, orderId: string): Promise<OrderProfit | { error: string }> {
  const { data: order, error } = await supabaseAdmin
    .from('sale_orders')
    .select('id, receive_method, delivery_fee_std_per_liter, delivery_fee_surcharge_per_liter, delivery_fee_adjust_per_liter, discount_amount, sale_order_items(liters, unit_price, base_cost_price, is_deleted)')
    .eq('id', orderId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (error) return { error: error.message };
  if (!order) return { error: 'ไม่พบคำสั่งซื้อ' };

  const items = ((order as any).sale_order_items ?? [])
    .filter((it: any) => !it.is_deleted)
    .map((it: any) => ({ liters: Number(it.liters || 0), unit_price: Number(it.unit_price || 0), base_cost_price: it.base_cost_price == null ? null : Number(it.base_cost_price) }));
  const profit = computeOrderProfit({
    items,
    deliveryFeeStdPerLiter: Number(order.delivery_fee_std_per_liter || 0),
    deliveryFeeSurchargePerLiter: Number(order.delivery_fee_surcharge_per_liter || 0),
    deliveryFeeAdjustPerLiter: Number(order.delivery_fee_adjust_per_liter || 0),
    receiveMethod: order.receive_method,
    discountAmount: Number(order.discount_amount || 0),
  });

  const { error: updateError } = await supabaseAdmin
    .from('sale_orders')
    .update({
      revenue_ex_vat_amount: profit.revenueExVat,
      cost_goods_amount: profit.costGoods,
      cost_delivery_amount: profit.costDelivery,
      profit_amount: profit.profit,
      gp_percent: profit.gpPercent,
      cost_incomplete: profit.costIncomplete,
    })
    .eq('id', orderId)
    .eq('company_id', companyId);
  if (updateError) return { error: updateError.message };
  return profit;
}
