import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { pushLinePayload, type LinePushContext } from '@/lib/services/line';
import { inCustomerScope, loadCustomerScope } from '@/lib/services/customer-scope';

/**
 * Sends the price broadcast (Flex + text fallback) to selected LINE recipients.
 * Any role with the prices module may send; SALES can only reach recipients
 * linked to their own customers. Company always comes from the session.
 */
export async function POST(req: NextRequest) {
  const guard = await requireStaff('prices');
  if (guard.response) return guard.response;
  const { ctx } = guard;
  const companyId = ctx.companyId;

  const body = await req.json().catch(() => ({}));
  const title = String(body.title ?? '').trim() || 'ราคาขาย';
  const message = String(body.message ?? '');
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const recipients = (Array.isArray(body.recipients) ? body.recipients : []) as Array<{ lineCustomerId: string }>;
  if (!recipients.length) return NextResponse.json({ error: 'กรุณาเลือกผู้รับอย่างน้อย 1 ราย' }, { status: 422 });
  if (!messages.length && !message.trim()) return NextResponse.json({ error: 'ไม่มีข้อความสำหรับส่ง' }, { status: 422 });

  const scope = await loadCustomerScope(ctx);
  if (scope && 'error' in scope) return NextResponse.json({ error: scope.error }, { status: 400 });

  const { data: b, error } = await supabaseAdmin
    .from('line_broadcasts')
    .insert({ company_id: companyId, title, message, status: 'SENT', created_by: ctx.userId })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const failures: Array<{ lineCustomerId: string; lineRecipientId: string; error: string }> = [];
  for (const r of recipients) {
    const lineCustomerId = String(r?.lineCustomerId ?? '').trim();
    try {
      const { data: lineCustomer, error: lineCustomerError } = await supabaseAdmin
        .from('line_customers')
        .select('line_user_id, group_id, customer_id')
        .eq('id', lineCustomerId)
        .eq('company_id', companyId)
        .eq('is_deleted', false)
        .maybeSingle();
      if (lineCustomerError) throw new Error(lineCustomerError.message);
      const lineRecipientId = lineCustomer?.group_id || lineCustomer?.line_user_id;
      if (!lineCustomer || !lineRecipientId) throw new Error('ไม่พบ LINE User หรือ Group');
      if (!inCustomerScope(scope, lineCustomer.customer_id)) throw new Error('ไม่มีสิทธิ์ส่งถึงลูกค้ารายนี้');

      const linePushContext: LinePushContext = {
        companyId,
        lineCustomerId,
        recipientType: lineCustomer.group_id ? 'GROUP' : 'USER',
        source: 'price_broadcast',
      };
      await pushLinePayload(lineRecipientId, messages.length ? messages : [{ type: 'text', text: message }], linePushContext);

      await supabaseAdmin.from('line_broadcast_recipients').insert({ company_id: companyId, line_broadcast_id: b.id, line_customer_id: lineCustomerId, sent_at: new Date().toISOString() });
      await supabaseAdmin.from('line_messages').insert({
        company_id: companyId,
        line_customer_id: lineCustomerId,
        group_id: lineCustomer.group_id || null,
        direction: 'OUT',
        message_type: 'price_broadcast',
        message_text: message,
      });
    } catch (e) {
      failures.push({ lineCustomerId, lineRecipientId: 'unknown', error: (e as Error).message });
    }
  }
  if (failures.length) return NextResponse.json({ ok: false, broadcast: b, failures }, { status: 207 });
  return NextResponse.json({ ok: true, broadcast: b });
}
