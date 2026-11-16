import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/common';
import { publicSlipSubmitSchema } from '@/lib/validation/accounting';
import { findLinkByToken, loadPublicPaymentView, SLIP_BUCKET } from '@/lib/services/payment-slip';
import { LINK_STATE_MESSAGES, SLIP_MAX_BYTES, SLIP_MAX_PENDING_PER_LINK, slipExtension, sniffSlipMime, validateSlipFile } from '@/lib/utils/payment-slip';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const notFound = () => NextResponse.json({ error: 'ไม่พบลิงก์ หรือลิงก์ไม่ถูกต้อง' }, { status: 404 });

/** Public (no login): order summary for the slip page. The token is the only credential. */
export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await findLinkByToken(token);
  if (!link) return notFound();
  return NextResponse.json(await loadPublicPaymentView(link), { headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Public (no login): customer uploads a pay-in slip (multipart `file` + form fields).
 * The slip waits for accounting to approve; no payment is recorded here.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = await findLinkByToken(token);
  if (!link) return notFound();

  const view = await loadPublicPaymentView(link);
  if (view.state !== 'ACTIVE') return NextResponse.json({ error: LINK_STATE_MESSAGES[view.state] }, { status: 410 });

  const { count } = await supabaseAdmin
    .from('payment_slip_submissions')
    .select('id', { count: 'exact', head: true })
    .eq('link_id', link.id)
    .eq('status', 'PENDING');
  if ((count ?? 0) >= SLIP_MAX_PENDING_PER_LINK) {
    return NextResponse.json({ error: 'มีสลิปรอตรวจสอบหลายรายการแล้ว กรุณารอเจ้าหน้าที่ตรวจสอบก่อน' }, { status: 429 });
  }

  const contentLength = Number(req.headers.get('content-length') || 0);
  if (contentLength > SLIP_MAX_BYTES + 64 * 1024) return NextResponse.json({ error: 'ไฟล์ใหญ่เกิน 5 MB' }, { status: 413 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 422 });
  const parsed = parseBody(publicSlipSubmitSchema, {
    amount: form.get('amount'),
    transferred_at: form.get('transferred_at'),
    reference_no: form.get('reference_no') ?? undefined,
    payer_name: form.get('payer_name') ?? undefined,
    note: form.get('note') ?? undefined,
  });
  if (parsed.response) return parsed.response;

  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'กรุณาแนบไฟล์สลิป' }, { status: 422 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = sniffSlipMime(buffer.subarray(0, 16));
  const fileError = validateSlipFile(mime ?? String(file.type || ''), buffer.length) ?? (mime ? null : 'ไฟล์ไม่ใช่รูปภาพหรือ PDF ที่ถูกต้อง');
  if (fileError || !mime) return NextResponse.json({ error: fileError }, { status: 422 });

  const path = `${link.company_id}/${link.sale_order_id}/${Date.now()}-${randomBytes(6).toString('hex')}.${slipExtension(mime)}`;
  const { error: uploadError } = await supabaseAdmin.storage.from(SLIP_BUCKET).upload(path, buffer, { contentType: mime, upsert: false });
  if (uploadError) return NextResponse.json({ error: 'อัปโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่' }, { status: 400 });

  const input = parsed.data;
  const { error } = await supabaseAdmin.from('payment_slip_submissions').insert({
    company_id: link.company_id,
    sale_order_id: link.sale_order_id,
    link_id: link.id,
    file_path: path,
    file_mime: mime,
    amount: input.amount,
    transferred_at: input.transferred_at,
    reference_no: input.reference_no ?? null,
    payer_name: input.payer_name ?? null,
    note: input.note ?? null,
    submitter_ip: (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null,
  });
  if (error) {
    await supabaseAdmin.storage.from(SLIP_BUCKET).remove([path]);
    return NextResponse.json({ error: 'บันทึกสลิปไม่สำเร็จ กรุณาลองใหม่' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
