import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { data: base, error: baseErr } = await supabaseAdmin
    .from('oil_base_prices')
    .select('*, refineries(name,image_url)')
    .eq('id', id)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .single();

  if (baseErr) return NextResponse.json({ error: baseErr.message }, { status: 400 });

  const { data: items, error: itemErr } = await supabaseAdmin
    .from('oil_price_items')
    .select('*, depots(code, name)')
    .eq('oil_base_price_id', id)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .order('product_code', { ascending: true });

  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 });

  return NextResponse.json({ base, items: items ?? [] });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const companyId = resolveCompanyId(body.company_id);
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 422 });

  const { effective_date, effective_time, expires_date, expires_time, refinery_id, rows } = body;
  if ((expires_date && !expires_time) || (!expires_date && expires_time)) {
    return NextResponse.json({ error: 'กรุณาระบุวันและเวลาหมดอายุให้ครบ' }, { status: 422 });
  }

  const effectiveAt = effective_date && effective_time
    ? (() => {
        const [dd, mm, yyyy] = String(effective_date).split('/');
        const isoDate = `${yyyy}-${mm}-${dd}`;
        return { isoDate, effectiveAt: `${isoDate}T${effective_time}:00` };
      })()
    : null;
  const expiresAt = expires_date && expires_time
    ? (() => {
        const [dd, mm, yyyy] = String(expires_date).split('/');
        const isoDate = `${yyyy}-${mm}-${dd}`;
        return { isoDate, expiresAt: `${isoDate}T${expires_time}:00` };
      })()
    : { isoDate: null, expiresAt: null };

  const { error: baseErr } = await supabaseAdmin
    .from('oil_base_prices')
    .update({
      refinery_id: refinery_id ?? null,
      effective_date: effectiveAt?.isoDate,
      effective_at: effectiveAt?.effectiveAt,
      expires_date: expiresAt.isoDate,
      expires_at: expiresAt.expiresAt,
      confirmed: true,
    })
    .eq('id', id)
    .eq('company_id', companyId);

  if (baseErr) return NextResponse.json({ error: baseErr.message }, { status: 400 });

  if (Array.isArray(rows)) {
    const { error: softErr } = await supabaseAdmin
      .from('oil_price_items')
      .update({ is_deleted: true })
      .eq('oil_base_price_id', id)
      .eq('company_id', companyId)
      .eq('is_deleted', false);

    if (softErr) return NextResponse.json({ error: softErr.message }, { status: 400 });

    if (rows.length) {
      const payload = rows.map((r: any) => ({
        company_id: companyId,
        oil_base_price_id: id,
        depot_id: r.depot_id,
        product_code: r.product_code,
        product_name: r.product_name,
        base_cost_price: Number(r.price ?? 0),
        selling_price: Number(r.price ?? 0),
      }));
      const { error: itemErr } = await supabaseAdmin.from('oil_price_items').insert(payload);
      if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { error: baseErr } = await supabaseAdmin
    .from('oil_base_prices')
    .update({ is_deleted: true })
    .eq('id', id)
    .eq('company_id', companyId);
  if (baseErr) return NextResponse.json({ error: baseErr.message }, { status: 400 });

  await supabaseAdmin
    .from('oil_price_items')
    .update({ is_deleted: true })
    .eq('oil_base_price_id', id)
    .eq('company_id', companyId)
    .eq('is_deleted', false);

  return NextResponse.json({ ok: true });
}
