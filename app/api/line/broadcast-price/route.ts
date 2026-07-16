import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { pushLineMessage, pushLinePayload, type LinePushContext } from '@/lib/services/line';

export async function POST(req: NextRequest) {
  const { company_id, title, message, messages, recipients } = await req.json();
  const { data: b, error } = await supabaseAdmin.from('line_broadcasts').insert({ company_id, title, message, status: 'SENT' }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const failures: Array<{ lineCustomerId: string; lineRecipientId: string; error: string }> = [];
  for (const r of recipients as Array<{ lineCustomerId: string }>) {
    try {
      const { data: lineCustomer, error: lineCustomerError } = await supabaseAdmin
        .from('line_customers')
        .select('line_user_id, group_id')
        .eq('id', r.lineCustomerId)
        .eq('company_id', company_id)
        .eq('is_deleted', false)
        .single();
      const lineRecipientId = lineCustomer?.group_id || lineCustomer?.line_user_id;
      if (lineCustomerError || !lineRecipientId) throw new Error(lineCustomerError?.message || 'ไม่พบ LINE User หรือ Group');
      const linePushContext: LinePushContext = {
        companyId: company_id,
        lineCustomerId: r.lineCustomerId,
        recipientType: lineCustomer?.group_id ? 'GROUP' : 'USER',
        source: 'price_broadcast',
      };

      if (Array.isArray(messages) && messages.length) {
        try {
          await pushLinePayload(lineRecipientId, messages, linePushContext);
        } catch {
          //await pushLineMessage(lineRecipientId, message);
           await pushLinePayload(lineRecipientId, messages, linePushContext);
        }
      } else {
         await pushLinePayload(lineRecipientId, messages, linePushContext);
       // await pushLineMessage(lineRecipientId, message);
      }
      await supabaseAdmin.from('line_broadcast_recipients').insert({ company_id, line_broadcast_id: b.id, line_customer_id: r.lineCustomerId, sent_at: new Date().toISOString() });
      await supabaseAdmin.from('line_messages').insert({
        company_id,
        line_customer_id: r.lineCustomerId,
        group_id: lineCustomer?.group_id || null,
        direction: 'OUT',
        message_type: 'price_broadcast',
        message_text: message,
      });
    } catch (e) {
      failures.push({
        lineCustomerId: r.lineCustomerId,
        lineRecipientId: 'unknown',
        error: (e as Error).message,
      });
    }
  }
  if (failures.length) {
    return NextResponse.json({ ok: false, broadcast: b, failures }, { status: 207 });
  }
  return NextResponse.json({ ok: true, broadcast: b });
}
