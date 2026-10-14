import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { loadDeliveryFeeSurcharge } from '@/lib/services/order-items';
import { canAccessCustomer, customerForbidden } from '@/lib/services/customer-scope';
import { isAdminRole } from '@/lib/auth/permissions';
import { selectPriceRounds, type PriceRoundRow } from '@/lib/services/price-rounds';

type CustomerAccess = {
  allowed_refinery_ids?: string[] | null;
  allowed_depot_ids?: string[] | null;
  allowed_oil_product_ids?: string[] | null;
  allowed_payment_condition_ids?: string[] | null;
  depot_transport_fees?: Record<string, unknown> | null;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

/**
 * Price options for a customer: allowed refineries/depots/products with the
 * current base cost, plus the customer's price adjustment and transport fees.
 * Admins may pass `round_id` to price from a specific (e.g. older) round and
 * receive the list of selectable rounds as `price_rounds`.
 */
export async function GET(req: NextRequest) {
  const guard = await requireStaff('orders');
  if (guard.response) return guard.response;
  const companyId = guard.ctx.companyId;
  const customerId = String(req.nextUrl.searchParams.get('customer_id') || '').trim();
  const roundId = String(req.nextUrl.searchParams.get('round_id') || '').trim();
  const isAdmin = isAdminRole(guard.ctx.role);

  if (!isUuid(customerId)) return NextResponse.json({ error: 'customer_id ต้องเป็น UUID เท่านั้น' }, { status: 422 });
  if (roundId && !isUuid(roundId)) return NextResponse.json({ error: 'round_id ต้องเป็น UUID เท่านั้น' }, { status: 422 });
  if (roundId && !isAdmin) return NextResponse.json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่เลือกรอบราคาได้' }, { status: 403 });
  if (!(await canAccessCustomer(guard.ctx, customerId))) return customerForbidden();

  const [customerRes, accessRes, roundsRes, productsRes, surchargeRes] = await Promise.all([
    supabaseAdmin
      .from('customers')
      .select('id, price_adjustment_per_liter, sales_fee_per_liter')
      .eq('id', customerId)
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .maybeSingle(),
    supabaseAdmin
      .from('customer_portal_access')
      .select('allowed_refinery_ids, allowed_depot_ids, allowed_oil_product_ids, allowed_payment_condition_ids, depot_transport_fees')
      .eq('customer_id', customerId)
      .eq('company_id', companyId)
      .maybeSingle(),
    supabaseAdmin
      .from('oil_base_prices')
      .select('id, refinery_id, effective_date, effective_at, expires_date, expires_at')
      .eq('company_id', companyId)
      .eq('confirmed', true)
      .eq('is_deleted', false)
      .order('effective_at', { ascending: false, nullsFirst: false })
      .order('effective_date', { ascending: false }),
    supabaseAdmin
      .from('oil_products')
      .select('id, code')
      .eq('company_id', companyId)
      .eq('is_deleted', false),
    loadDeliveryFeeSurcharge(companyId),
  ]);

  if (customerRes.error) return NextResponse.json({ error: customerRes.error.message }, { status: 400 });
  if (!customerRes.data) return NextResponse.json({ error: 'ไม่พบลูกค้าที่เลือก' }, { status: 404 });
  if (accessRes.error) return NextResponse.json({ error: accessRes.error.message }, { status: 400 });
  if (roundsRes.error) return NextResponse.json({ error: roundsRes.error.message }, { status: 400 });
  if (productsRes.error) return NextResponse.json({ error: productsRes.error.message }, { status: 400 });
  if ('error' in surchargeRes) return NextResponse.json({ error: surchargeRes.error }, { status: 400 });
  const deliveryFeeSurcharge = surchargeRes.surcharge;

  const access = (accessRes.data ?? {
    allowed_refinery_ids: [],
    allowed_depot_ids: [],
    allowed_oil_product_ids: [],
    allowed_payment_condition_ids: [],
    depot_transport_fees: {},
  }) as CustomerAccess;
  const customerInfo = {
    id: customerRes.data.id,
    price_adjustment_per_liter: Number(customerRes.data.price_adjustment_per_liter || 0),
    sales_fee_per_liter: Number(customerRes.data.sales_fee_per_liter || 0),
  };
  const deliveryFeeByDepot: Record<string, number> = {};
  for (const [depotId, value] of Object.entries(access.depot_transport_fees ?? {})) {
    const fee = Number(value || 0);
    if (Number.isFinite(fee) && fee > 0) deliveryFeeByDepot[depotId] = fee;
  }
  const allowedRefineryIds = access.allowed_refinery_ids ?? [];
  const allowedDepotIds = access.allowed_depot_ids ?? [];
  const allowedProductIds = access.allowed_oil_product_ids ?? [];

  const nowBangkok = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const nowPart = (type: string) => nowBangkok.find((part) => part.type === type)?.value || '';
  const nowDate = `${nowPart('year')}-${nowPart('month')}-${nowPart('day')}`;
  const nowTime = `${nowPart('hour')}:${nowPart('minute')}:${nowPart('second')}`;

  const { selected: currentRounds, options: roundOptions, overrideFound } = selectPriceRounds(
    (roundsRes.data ?? []) as PriceRoundRow[],
    allowedRefineryIds,
    nowDate,
    nowTime,
    roundId || null,
  );
  if (roundId && !overrideFound) return NextResponse.json({ error: 'ไม่พบรอบราคาที่เลือก หรือลูกค้าไม่มีสิทธิ์โรงกลั่นนี้' }, { status: 404 });
  const priceRounds = isAdmin ? roundOptions : undefined;

  const roundIds = currentRounds.map((round) => String(round.id));
  if (!roundIds.length) {
    return NextResponse.json({
      access,
      customer: customerInfo,
      delivery_fee_per_liter_by_depot: deliveryFeeByDepot,
      delivery_fee_surcharge_per_liter: deliveryFeeSurcharge,
      price_options: [],
      price_rounds: priceRounds,
    });
  }

  const { data: priceItems, error: priceItemsError } = await supabaseAdmin
    .from('oil_price_items')
    .select('oil_base_price_id, depot_id, product_code, product_name, base_cost_price, depots(id, is_active)')
    .in('oil_base_price_id', roundIds)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('product_code', { ascending: true });

  if (priceItemsError) return NextResponse.json({ error: priceItemsError.message }, { status: 400 });

  const refineryByRoundId = new Map(currentRounds.map((round) => [String(round.id), String(round.refinery_id || '')]));
  const productByCode = new Map(
    (productsRes.data ?? []).map((product) => [String(product.code || '').toUpperCase(), String(product.id)]),
  );

  const priceOptions = (priceItems ?? []).flatMap((item: any) => {
    const depotId = String(item.depot_id || '');
    const productId = productByCode.get(String(item.product_code || '').toUpperCase());
    const baseCostPrice = Number(item.base_cost_price || 0);
    if (!depotId || item.depots?.is_active === false || baseCostPrice <= 0) return [];
    if (allowedDepotIds.length && !allowedDepotIds.includes(depotId)) return [];
    if (allowedProductIds.length && (!productId || !allowedProductIds.includes(productId))) return [];

    return [{
      refinery_id: refineryByRoundId.get(String(item.oil_base_price_id)) || null,
      depot_id: depotId,
      product_code: String(item.product_code || ''),
      product_name: String(item.product_name || ''),
      base_cost_price: baseCostPrice,
    }];
  });

  return NextResponse.json({
    access,
    customer: customerInfo,
    delivery_fee_per_liter_by_depot: deliveryFeeByDepot,
    delivery_fee_surcharge_per_liter: deliveryFeeSurcharge,
    price_options: priceOptions,
    price_rounds: priceRounds,
  });
}
