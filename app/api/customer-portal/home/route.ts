import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { supabaseAdmin } from '@/lib/supabase/server';

type AccessRow = {
  customer_id: string;
  company_id: string;
  allowed_refinery_ids: string[];
  allowed_depot_ids: string[];
  allowed_oil_product_ids: string[];
  allowed_payment_condition_ids: string[];
  depot_transport_fees?: Record<string, number>;
  can_place_order: boolean;
};

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบลูกค้า' }, { status: 401 });
  }

  const authUserId = authData.user.id;

  const { data: portalUser, error: portalError } = await supabaseAdmin
    .from('customer_portal_users')
    .select('customer_id, company_id, is_active')
    .eq('auth_user_id', authUserId)
    .eq('is_active', true)
    .maybeSingle();

  if (portalError) return NextResponse.json({ error: portalError.message }, { status: 400 });
  if (!portalUser) return NextResponse.json({ error: 'บัญชีนี้ยังไม่ได้รับสิทธิ์พอร์ทัลลูกค้า' }, { status: 403 });

  const { customer_id: customerId, company_id: companyId } = portalUser;

  const [customerRes, accessRes, creditRes] = await Promise.all([
    supabaseAdmin
      .from('customers')
      .select('id, company_name, credit_limit, status')
      .eq('id', customerId)
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .single(),
    supabaseAdmin
      .from('customer_portal_access')
      .select('*')
      .eq('customer_id', customerId)
      .eq('company_id', companyId)
      .maybeSingle(),
    supabaseAdmin.rpc('get_customer_credit_status', { p_customer: customerId }),
  ]);

  if (customerRes.error) return NextResponse.json({ error: customerRes.error.message }, { status: 400 });
  if (accessRes.error) return NextResponse.json({ error: accessRes.error.message }, { status: 400 });
  if (creditRes.error) return NextResponse.json({ error: creditRes.error.message }, { status: 400 });

  const access = (accessRes.data ?? {
    allowed_refinery_ids: [],
    allowed_depot_ids: [],
    allowed_oil_product_ids: [],
    allowed_payment_condition_ids: [],
    depot_transport_fees: {},
    can_place_order: true,
  }) as AccessRow;

  const refineryIds = access.allowed_refinery_ids ?? [];
  const depotIds = access.allowed_depot_ids ?? [];
  const oilProductIds = access.allowed_oil_product_ids ?? [];
  const paymentConditionIds = access.allowed_payment_condition_ids ?? [];

  const roundsRes = await supabaseAdmin
    .from('oil_base_prices')
    .select('id, refinery_id, effective_date, effective_at, expires_date, expires_at, remark, refineries(name,image_url)')
    .eq('company_id', companyId)
    .eq('confirmed', true)
    .eq('is_deleted', false)
    .order('effective_at', { ascending: false, nullsFirst: false })
    .order('effective_date', { ascending: false });

  if (roundsRes.error) return NextResponse.json({ error: roundsRes.error.message }, { status: 400 });

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
  const nowPart = (type: string) => nowBangkok.find((p) => p.type === type)?.value || '';
  const nowYmd = `${nowPart('year')}-${nowPart('month')}-${nowPart('day')}`;
  const nowHms = `${nowPart('hour')}:${nowPart('minute')}:${nowPart('second')}`;

  const normalizeTime = (value: string | null | undefined, fallback: '00:00:00' | '23:59:59') => {
    const text = String(value || '').trim();
    if (!text) return fallback;
    const match = text.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return fallback;
    return `${match[1]}:${match[2]}:${match[3] || '00'}`;
  };


  const latestByRefinery = new Map<string, any>();
  for (const row of roundsRes.data ?? []) {
    const effectiveDate = String(row.effective_date || '').trim();
    const effectiveTime = normalizeTime(row.effective_at, '00:00:00');
    if (!effectiveDate) continue;
    if (effectiveDate > nowYmd) continue;
    if (effectiveDate === nowYmd && effectiveTime > nowHms) continue;

    const expiresDate = String(row.expires_date || '').trim();
    const expiresTime = normalizeTime(row.expires_at, '23:59:59');
    if (expiresDate && expiresDate < nowYmd) continue;
    if (expiresDate && expiresDate === nowYmd && expiresTime <= nowHms) continue;

    const rid = String(row.refinery_id ?? '');
    if (!rid) continue;
    if (refineryIds.length && !refineryIds.includes(rid)) continue;
    if (!latestByRefinery.has(rid)) latestByRefinery.set(rid, row);
  }

  const roundIds = [...latestByRefinery.values()].map((x) => x.id);

  let items: any[] = [];
  if (roundIds.length) {
    const itemsRes = await supabaseAdmin
      .from('oil_price_items')
      .select('id, oil_base_price_id, depot_id, product_code, product_name, base_cost_price,  depots(id, code, name, is_active)')
      .in('oil_base_price_id', roundIds)
      .eq('company_id', companyId)
      .eq('is_deleted', false)
      .order('product_code', { ascending: true });

    if (itemsRes.error) return NextResponse.json({ error: itemsRes.error.message }, { status: 400 });
    items = itemsRes.data ?? [];
  }

  const productsRes = await supabaseAdmin
    .from('oil_products')
    .select('id, code, name ,color_hex')
    .eq('company_id', companyId)
    .eq('is_deleted', false);

  if (productsRes.error) return NextResponse.json({ error: productsRes.error.message }, { status: 400 });

  const productByCode = new Map((productsRes.data ?? []).map((p) => [String(p.code ?? '').toUpperCase(), p]));

  items = items.filter((it) => {
    if (it.depots?.is_active === false) return false;
    if (depotIds.length && !depotIds.includes(String(it.depot_id ?? ''))) return false;
    if (!oilProductIds.length) return true;
    const p = productByCode.get(String(it.product_code ?? '').toUpperCase());
    return Boolean(p && oilProductIds.includes(String(p.id)));
  });

  items = items.map((it) => {
    const p = productByCode.get(String(it.product_code ?? '').toUpperCase());
    return {
      ...it,
      color_hex: p?.color_hex ?? '#2563EB',
    };
  });

  const allowedPaymentRes = await supabaseAdmin
    .from('payment_conditions')
    .select('id, code, name, payment_type, credit_days, extra_cost_per_liter')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('payment_type', { ascending: true })
    .order('credit_days', { ascending: true });

  if (allowedPaymentRes.error) return NextResponse.json({ error: allowedPaymentRes.error.message }, { status: 400 });

  const allowedPaymentConditions = (allowedPaymentRes.data ?? []).filter((p) => {
    if (!paymentConditionIds.length) return true;
    return paymentConditionIds.includes(String(p.id));
  });

  return NextResponse.json({
    customer: {
      ...customerRes.data,
      payment_conditions: null,
    },
    credit: (creditRes.data ?? [])[0] ?? null,
    access,
    rounds: [...latestByRefinery.values()],
    items,
    allowedPaymentConditions,
  });
}
