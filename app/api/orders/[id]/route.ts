import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { resolveCompanyId } from '@/lib/supabase/company';
import { pushLineMessage } from '@/lib/services/line';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const companyId = resolveCompanyId(req.nextUrl.searchParams.get('company_id'));
  if (!companyId) return NextResponse.json({ error: 'กรุณาตั้งค่า company_id หรือ DEFAULT_COMPANY_ID' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('sale_orders')
    .select('*, payment_conditions(name, payment_type, credit_days), sale_order_items(*, refineries(id, name), depots(id, code, name))')
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
  const { data: currentOrder } = await supabaseAdmin
    .from('sale_orders')
    .select('id, order_status')
    .eq('id', id)
    .eq('company_id', companyId)
    .maybeSingle();
  let lineWarning = '';
  let effectivePayload = { ...orderPayload } as Record<string, unknown>;
  let { data, error } = await supabaseAdmin
    .from('sale_orders')
    .update(effectivePayload)
    .eq('id', id)
    .eq('company_id', companyId)
    .select('*')
    .single();

  if (error && String(error.message).includes('delivery_order_file_url')) {
    delete effectivePayload.delivery_order_file_url;
    ({ data, error } = await supabaseAdmin
      .from('sale_orders')
      .update(effectivePayload)
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .single());
  }

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

  const nextStatus = String(effectivePayload.order_status ?? data.order_status);
  const prevStatus = String(currentOrder?.order_status ?? '');
  if (nextStatus === 'PAID' && prevStatus !== 'PAID') {
    const { data: existingPayment } = await supabaseAdmin
      .from('payment_transactions')
      .select('id')
      .eq('company_id', companyId)
      .eq('sale_order_id', id)
      .eq('is_deleted', false)
      .maybeSingle();

    if (!existingPayment?.id) {
      const totalAmount = Array.isArray(items)
        ? items.reduce((sum: number, i: any) => sum + Number(i.liters || 0) * Number(i.unit_price || 0), 0)
        : 0;
      let amount = totalAmount;
      if (amount <= 0) {
        const { data: existingItems } = await supabaseAdmin
          .from('sale_order_items')
          .select('liters, unit_price')
          .eq('company_id', companyId)
          .eq('sale_order_id', id)
          .eq('is_deleted', false);
        amount = (existingItems || []).reduce((sum: number, it: any) => sum + Number(it.liters || 0) * Number(it.unit_price || 0), 0);
      }
      await supabaseAdmin.from('payment_transactions').insert({
        company_id: companyId,
        sale_order_id: id,
        amount: Number(amount || 0),
      });
    }
  }

  const deliveryOrderNo = String(effectivePayload.delivery_order_no ?? '').trim();
  const deliveryOrderFileUrl = String(effectivePayload.delivery_order_file_url ?? '').trim();
  if (deliveryOrderNo || deliveryOrderFileUrl) {
    try {
      const { data: lineCustomer } = await supabaseAdmin
        .from('line_customers')
        .select('line_user_id')
        .eq('company_id', companyId)
        .eq('customer_id', data.customer_id)
        .eq('is_deleted', false)
        .maybeSingle();

      if (lineCustomer?.line_user_id) {
        const orderNo = data.order_no || data.id;
        const message = [
          `อัปเดต Delivery Order สำหรับคำสั่งซื้อ ${orderNo}`,
          deliveryOrderNo ? `DO: ${deliveryOrderNo}` : '',
          deliveryOrderFileUrl ? `เอกสาร: ${deliveryOrderFileUrl}` : '',
        ].filter(Boolean).join('\n');
        await pushLineMessage(lineCustomer.line_user_id, message);
      } else {
        lineWarning = 'ไม่พบบัญชี LINE ของลูกค้ารายนี้';
      }
    } catch (e) {
      lineWarning = `ส่ง LINE ไม่สำเร็จ: ${(e as Error).message}`;
    }
  }

  return NextResponse.json({ ...data, line_warning: lineWarning || undefined });
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
