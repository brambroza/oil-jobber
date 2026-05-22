import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('sale_orders')
    .select('*, sale_order_items(*, refineries(id, name), depots(id, code, name))')
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const companyId = resolveCompanyId(body.company_id);
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });

  const { items, company_id, ...orderPayload } = body;
  const { data, error } = await supabaseAdmin
    .from('sale_orders')
    .update(orderPayload)
    .eq('id', id)
    .eq('company_id', companyId)
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  if (Array.isArray(items)) {
    const { error: softDeleteErr } = await supabaseAdmin
      .from('sale_order_items')
      .update({ is_deleted: true })
      .eq('sale_order_id', id)
      .eq('company_id', companyId)
      .eq('is_deleted', false);

    if (softDeleteErr) return NextResponse.json({ error: softDeleteErr.message }, { status: 400 });

    if (items.length > 0) {
      const payload = items.map((i: any) => ({
        company_id: companyId,
        sale_order_id: id,
        refinery_id: i.refinery_id ?? null,
        depot_id: i.depot_id ?? null,
        product_code: String(i.product_code ?? '').trim(),
        product_name: String(i.product_name ?? '').trim(),
        liters: Number(i.liters ?? 0),
        unit_price: Number(i.unit_price ?? 0),
      }));

      const { error: itemErr } = await supabaseAdmin.from('sale_order_items').insert(payload);
      if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 });
    }
  }

  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { error } = await supabaseAdmin
    .from('sale_orders')
    .update({ is_deleted: true })
    .eq('id', id)
    .eq('company_id', companyId);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabaseAdmin
    .from('sale_order_items')
    .update({ is_deleted: true })
    .eq('sale_order_id', id)
    .eq('company_id', companyId)
    .eq('is_deleted', false);

  return NextResponse.json({ ok: true });
}
