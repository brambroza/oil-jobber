import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function GET(req: NextRequest) {
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('sale_orders')
    .select('*, customers(company_name), payment_conditions(name, payment_type, credit_days), sale_order_items(liters, amount, depots(code, name), refineries(name))')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .eq('sale_order_items.is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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
    const creditLabel = r.payment_conditions?.name
      ? `${r.payment_conditions.name}${r.payment_conditions?.payment_type ? ` (${r.payment_conditions.payment_type}${r.payment_conditions?.credit_days ? ` ${r.payment_conditions.credit_days} วัน` : ''})` : ''}`
      : null;

    return {
      ...r,
      refinery_summary: refineryLabels.join(', ') || null,
      depot_summary: depotLabels.join(', ') || null,
      selected_credit_label: creditLabel,
      total_liters: (r.sale_order_items ?? []).reduce((s: number, it: any) => s + Number(it.liters || 0), 0),
      total_amount: (r.sale_order_items ?? []).reduce((s: number, it: any) => s + Number(it.amount || 0), 0),
      sale_order_items: undefined,
    };
  });

  return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
  const { company_id, ...payload } = await req.json();
  const resolvedCompanyId = resolveCompanyId(company_id);
  if (!resolvedCompanyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });
  const { items, ...order } = payload;
  let insertPayload = { company_id: resolvedCompanyId, ...order, order_status: order.order_status ?? 'SUBMITTED' } as Record<string, unknown>;
  let { data: o, error } = await supabaseAdmin
    .from('sale_orders')
    .insert(insertPayload)
    .select('*')
    .single();

  if (error && String(error.message).includes('delivery_order_file_url')) {
    delete insertPayload.delivery_order_file_url;
    ({ data: o, error } = await supabaseAdmin
      .from('sale_orders')
      .insert(insertPayload)
      .select('*')
      .single());
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (Array.isArray(items) && items.length) {
    await supabaseAdmin
      .from('sale_order_items')
      .insert(
        items.map((i: any) => ({
          company_id: resolvedCompanyId,
          sale_order_id: o.id,
          refinery_id: i.refinery_id ?? null,
          depot_id: i.depot_id ?? null,
          product_code: String(i.product_code ?? '').trim(),
          product_name: String(i.product_name ?? '').trim(),
          liters: Number(i.liters ?? 0),
          unit_price: Number(i.unit_price ?? 0),
        })),
      );
  }

  return NextResponse.json(o);
}
