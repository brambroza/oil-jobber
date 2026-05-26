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

  // Parse datetime consistently across local/Vercel:
  // - if source already has timezone (Z/+07:00) => keep absolute instant
  // - if source has no timezone => treat as Bangkok local time (+07:00)
  const parseBangkokMs = (value: string): number => {
    const raw = String(value || '').trim();
    if (!raw) return Number.NaN;
    const normalized = raw.includes('T') ? raw : raw.replace(' ', 'T');
    if (/(Z|[+-]\d{2}:\d{2})$/.test(normalized)) {
      return new Date(normalized).getTime();
    }
    return new Date(`${normalized}+07:00`).getTime();
  };
  const mergeDateTime = (
    dateValue: string | null | undefined,
    dateTimeValue: string | null | undefined,
    fallbackTime: '00:00:00' | '23:59:59',
  ): number => {
    const dateText = String(dateValue || '').trim();
    const dtText = String(dateTimeValue || '').trim();
    if (dtText) {
      // Primary rule: when business date is present, use that date and only time-of-day from *_at.
      // This avoids timezone serialization differences between environments.
      if (dateText) {
        const hhmmss = (() => {
          if (/^\d{2}:\d{2}(:\d{2})?/.test(dtText)) {
            return dtText.slice(0, 8).padEnd(8, ':00');
          }
          const m = dtText.match(/T(\d{2}:\d{2}:\d{2})| (\d{2}:\d{2}:\d{2})/);
          if (m?.[1]) return m[1];
          if (m?.[2]) return m[2];
          return fallbackTime;
        })();
        return parseBangkokMs(`${dateText}T${hhmmss}`);
      }
      // Handle "HH:mm:ss" style by combining with date when available.
      if (!dtText.includes('T') && !dtText.includes(' ') && dateText) {
        return parseBangkokMs(`${dateText}T${dtText.slice(0, 8)}`);
      }
      return parseBangkokMs(dtText);
    }
    if (!dateText) return Number.NaN;
    return parseBangkokMs(`${dateText}T${fallbackTime}`);
  };
  const nowMs = Date.now();


  const latestByRefinery = new Map<string, any>();
  for (const row of roundsRes.data ?? []) {
    const effectiveMs = mergeDateTime(row.effective_date, row.effective_at, '00:00:00');
    if (Number.isNaN(effectiveMs) || effectiveMs > nowMs) continue;
    const expiresMs = row.expires_date || row.expires_at
      ? mergeDateTime(row.expires_date, row.expires_at, '23:59:59')
      : Number.POSITIVE_INFINITY;
   

    if (!Number.isNaN(expiresMs) && expiresMs <= nowMs) continue;

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
      .select('id, oil_base_price_id, depot_id, product_code, product_name, base_cost_price,  depots(id, code, name)')
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
