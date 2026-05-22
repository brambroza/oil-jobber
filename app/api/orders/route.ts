import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function GET(req: NextRequest) {
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('sale_orders')
    .select('*, customers(company_name)')
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const { company_id, ...payload } = await req.json();
  const resolvedCompanyId = resolveCompanyId(company_id);
  if (!resolvedCompanyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });
  const { items, ...order } = payload;
  const { data: o, error } = await supabaseAdmin
    .from('sale_orders')
    .insert({ company_id: resolvedCompanyId, ...order, order_status: order.order_status ?? 'SUBMITTED' })
    .select('*')
    .single();

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
