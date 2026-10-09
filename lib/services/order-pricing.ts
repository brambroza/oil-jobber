/**
 * Pure pricing helpers shared by API routes, the admin order drawer and the
 * customer portal. Every per-liter value is in baht INCLUDING 7% VAT, matching
 * the existing `base × 1.07 + extra` convention of the system.
 */

export const VAT_MULTIPLIER = 1.07;
export const VAT_RATE = 0.07;

/** Rounds to 2 decimals using half-up on the absolute value. */
export function round2(value: number): number {
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
}

/**
 * Selling price per liter (incl. VAT).
 * @param baseCostPrice - refinery base cost per liter (excl. VAT)
 * @param paymentExtraPerLiter - payment-condition surcharge per liter (incl. VAT)
 * @param customerAdjustPerLiter - customer-specific ± adjustment per liter (incl. VAT)
 */
export function computeUnitPrice(
  baseCostPrice: number,
  paymentExtraPerLiter: number,
  customerAdjustPerLiter = 0,
): number {
  const standard = round2(Number(baseCostPrice || 0) * VAT_MULTIPLIER + Number(paymentExtraPerLiter || 0));
  return round2(standard + Number(customerAdjustPerLiter || 0));
}

/**
 * Lowest selling price per liter allowed (incl. VAT): standard price plus the
 * admin-set customer adjustment. Sales may raise the price above this but not
 * go below it. The sales fee is not part of the floor.
 */
export function computeFloorUnitPrice(baseCostPrice: number, paymentExtraPerLiter: number, adminAdjustPerLiter = 0): number {
  return computeUnitPrice(baseCostPrice, paymentExtraPerLiter, adminAdjustPerLiter);
}

/** Standard price before the customer adjustment (used for the "มาตรฐาน" hint). */
export function computeStandardUnitPrice(baseCostPrice: number, paymentExtraPerLiter: number): number {
  return round2(Number(baseCostPrice || 0) * VAT_MULTIPLIER + Number(paymentExtraPerLiter || 0));
}

/**
 * Delivery fee for an order (incl. VAT).
 * @param stdPerLiter - standard transport fee per liter for the depot
 * @param adjustPerLiter - per-order ± adjustment per liter
 * @param totalLiters - total liters on the order
 * @param surchargePerLiter - company-wide surcharge per liter (ค่าขนส่งเพิ่มส่วนกลาง), default 0
 */
export function computeDeliveryFeeAmount(
  stdPerLiter: number,
  adjustPerLiter: number,
  totalLiters: number,
  surchargePerLiter = 0,
): number {
  const perLiter = Number(stdPerLiter || 0) + Number(surchargePerLiter || 0) + Number(adjustPerLiter || 0);
  if (totalLiters <= 0) return 0;
  return round2(perLiter * Number(totalLiters || 0));
}

/** Splits a VAT-inclusive total into subtotal and VAT. */
export function splitVat(totalInclVat: number): { subtotal: number; vat: number } {
  const total = round2(Number(totalInclVat || 0));
  const subtotal = round2(total / VAT_MULTIPLIER);
  return { subtotal, vat: round2(total - subtotal) };
}

export type PricedItem = { liters: number; unit_price: number };

export type OrderTotalsInput = {
  items: PricedItem[];
  deliveryFeeStdPerLiter?: number;
  /** ค่าขนส่งเพิ่มส่วนกลาง บาท/ลิตร (snapshot บนบิล) */
  deliveryFeeSurchargePerLiter?: number;
  deliveryFeeAdjustPerLiter?: number;
  receiveMethod?: string | null;
  /** ส่วนลดท้ายบิล บาท (รวม VAT) */
  discountAmount?: number;
};

export type OrderTotals = {
  totalLiters: number;
  /** goods amount incl. VAT */
  itemsGross: number;
  /** delivery fee incl. VAT */
  feeGross: number;
  feePerLiter: number;
  /** goods + delivery fee before discount, incl. VAT */
  grossBeforeDiscount: number;
  /** bill discount incl. VAT (capped at grossBeforeDiscount) */
  discount: number;
  /** goods + delivery fee - discount, incl. VAT */
  net: number;
  beforeVat: number;
  vat: number;
};

/** True when the order is picked up by the customer (no delivery fee). */
export function isPickupMethod(receiveMethod: string | null | undefined): boolean {
  const method = String(receiveMethod || '');
  return method === 'PICKUP_BY_TRUCK' || method === 'PICKUP_BY_BARGE';
}

/** Computes all bill totals for an order from its items and delivery fee settings. */
export function computeOrderTotals(input: OrderTotalsInput): OrderTotals {
  const totalLiters = input.items.reduce((sum, item) => sum + Number(item.liters || 0), 0);
  const itemsGross = round2(input.items.reduce((sum, item) => sum + Number(item.liters || 0) * Number(item.unit_price || 0), 0));
  const pickup = isPickupMethod(input.receiveMethod);
  const surcharge = Number(input.deliveryFeeSurchargePerLiter || 0);
  const feePerLiter = pickup
    ? 0
    : Number(input.deliveryFeeStdPerLiter || 0) + surcharge + Number(input.deliveryFeeAdjustPerLiter || 0);
  const feeGross = pickup
    ? 0
    : computeDeliveryFeeAmount(input.deliveryFeeStdPerLiter || 0, input.deliveryFeeAdjustPerLiter || 0, totalLiters, surcharge);
  const grossBeforeDiscount = round2(itemsGross + feeGross);
  const discount = Math.min(grossBeforeDiscount, Math.max(0, round2(Number(input.discountAmount || 0))));
  const net = round2(grossBeforeDiscount - discount);
  const { subtotal, vat } = splitVat(net);
  return { totalLiters, itemsGross, feeGross, feePerLiter: round2(feePerLiter), grossBeforeDiscount, discount, net, beforeVat: subtotal, vat };
}

export type ProfitItem = PricedItem & {
  /** ราคาโรงกลั่น บาท/ลิตร ก่อน VAT; null/0 เมื่อพนักงานใส่ราคาเอง */
  base_cost_price?: number | null;
};

export type OrderProfit = {
  /** ยอดสุทธิก่อน VAT (น้ำมัน + ค่าขนส่ง − ส่วนลด) */
  revenueExVat: number;
  /** ต้นทุนน้ำมันก่อน VAT */
  costGoods: number;
  /** ต้นทุนขนส่งก่อน VAT (ค่าขนส่งมาตรฐานที่ admin ตั้ง) */
  costDelivery: number;
  costTotal: number;
  /** กำไร (+) / ขาดทุน (−) ก่อน VAT */
  profit: number;
  /** GP % ของรายได้ก่อน VAT */
  gpPercent: number;
  /** true เมื่อมีรายการที่ไม่มี base cost: ต้นทุนรายการนั้น = ราคาขาย (กำไร 0) */
  costIncomplete: boolean;
};

/**
 * Profit / loss of an order before VAT.
 *
 * - revenue  = net bill (goods + full delivery fee − discount) / 1.07
 * - cost     = Σ liters × base_cost_price (refinery price, excl. VAT)
 *              + total liters × delivery_fee_std_per_liter / 1.07 (0 for pickup)
 *   An item without a base cost is costed at its selling price, so it adds
 *   zero profit and sets `costIncomplete`.
 * - profit   = revenue − cost; gpPercent = profit / revenue × 100
 */
export function computeOrderProfit(input: OrderTotalsInput & { items: ProfitItem[] }): OrderProfit {
  const totals = computeOrderTotals(input);
  const pickup = isPickupMethod(input.receiveMethod);
  let costGoods = 0;
  let costIncomplete = false;
  for (const item of input.items) {
    const liters = Number(item.liters || 0);
    const base = Number(item.base_cost_price || 0);
    if (base > 0) {
      costGoods += liters * base;
    } else {
      costGoods += liters * Number(item.unit_price || 0) / VAT_MULTIPLIER;
      if (liters > 0) costIncomplete = true;
    }
  }
  costGoods = round2(costGoods);
  const costDelivery = pickup
    ? 0
    : round2(totals.totalLiters * Number(input.deliveryFeeStdPerLiter || 0) / VAT_MULTIPLIER);
  const costTotal = round2(costGoods + costDelivery);
  const revenueExVat = totals.beforeVat;
  const profit = round2(revenueExVat - costTotal);
  const gpPercent = revenueExVat > 0 ? round2((profit / revenueExVat) * 100) : 0;
  return { revenueExVat, costGoods, costDelivery, costTotal, profit, gpPercent, costIncomplete };
}
