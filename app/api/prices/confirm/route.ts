import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';

export async function POST(req: NextRequest) {
  const body = await req.json();

  // backward compatible mode
  if (body.oil_base_price_id) {
    const { data, error } = await supabaseAdmin
      .from('oil_base_prices')
      .update({ confirmed: true })
      .eq('id', body.oil_base_price_id)
      .select('*')
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json(data);
  }

  const companyId = resolveCompanyId(body.company_id);
  const refineryId = String(body.refinery_id ?? '').trim();
  const effectiveDate = String(body.effective_date ?? '').trim(); // dd/MM/yyyy
  const effectiveTime = String(body.effective_time ?? '').trim(); // HH:mm
  const expiresDate = String(body.expires_date ?? '').trim(); // dd/MM/yyyy
  const expiresTime = String(body.expires_time ?? '').trim(); // HH:mm
  const remark = String(body.remark ?? '').trim();
  const rows = Array.isArray(body.rows) ? body.rows : [];

  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id' }, { status: 422 });
  if (!refineryId) return NextResponse.json({ error: 'กรุณาเลือกโรงกลั่น' }, { status: 422 });
  if (!effectiveDate) return NextResponse.json({ error: 'กรุณาระบุวันที่มีผล' }, { status: 422 });
  if (!effectiveTime) return NextResponse.json({ error: 'กรุณาระบุเวลา' }, { status: 422 });
  if ((expiresDate && !expiresTime) || (!expiresDate && expiresTime)) {
    return NextResponse.json({ error: 'กรุณาระบุวันและเวลาออกให้ครบ' }, { status: 422 });
  }
  if (!rows.length) return NextResponse.json({ error: 'ไม่มีรายการราคาให้บันทึก' }, { status: 422 });

  const [dd, mm, yyyy] = effectiveDate.split('/');
  const isoDate = `${yyyy}-${mm}-${dd}`;
  const effectiveAt = `${isoDate}T${effectiveTime}:00`;
  let expiresIsoDate: string | null = null;
  let expiresAt: string | null = null;
  if (expiresDate && expiresTime) {
    const [edd, emm, eyyyy] = expiresDate.split('/');
    expiresIsoDate = `${eyyyy}-${emm}-${edd}`;
    expiresAt = `${expiresIsoDate}T${expiresTime}:00`;
  }

  const { data: base, error: baseErr } = await supabaseAdmin
    .from('oil_base_prices')
    .insert({
      company_id: companyId,
      refinery_id: refineryId,
      effective_date: isoDate,
      effective_at: effectiveAt,
      expires_date: expiresIsoDate,
      expires_at: expiresAt,
      remark: remark || null,
      confirmed: true,
    })
    .select('*')
    .single();

  if (baseErr) return NextResponse.json({ error: baseErr.message }, { status: 400 });

  const payload = rows.map((r: any) => ({
    company_id: companyId,
    oil_base_price_id: base.id,
    depot_id: r.depot_id,
    product_code: r.product_code,
    product_name: r.product_name,
    base_cost_price: Number(r.price ?? 0),
    selling_price: Number(r.price ?? 0),
  }));

  const { error: itemErr } = await supabaseAdmin.from('oil_price_items').insert(payload);
  if (itemErr) return NextResponse.json({ error: itemErr.message }, { status: 400 });

  return NextResponse.json({ ok: true, oil_base_price_id: base.id, inserted: payload.length });
}
