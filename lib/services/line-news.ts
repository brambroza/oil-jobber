import { supabaseAdmin } from '@/lib/supabase/server';
import { pushLinePayload } from '@/lib/services/line';

type NewsBroadcast = {
  id: string;
  company_id: string;
  seq: number;
  title: string;
  descriptions: string;
};

export function buildLineNewsFlex(news: Pick<NewsBroadcast, 'seq' | 'title' | 'descriptions'>) {
  const descriptionLines = String(news.descriptions || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    type: 'flex',
    altText: news.title,
    contents: {
      type: 'bubble',
      size: 'mega',
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        backgroundColor: '#0F3B82',
        contents: [
       /*    {
            type: 'text',
            text: `ข่าวสาร #${news.seq}`,
            size: 'xs',
            color: '#BFDBFE',
            weight: 'bold',
          }, */
          {
            type: 'text',
            text: news.title,
            size: 'xl',
            color: '#FFFFFF',
            weight: 'bold',
            wrap: true,
            margin: 'sm',
          },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '18px',
        spacing: 'md',
        contents: [
      /*     {
            type: 'text',
            text: 'Oil Jobber Update',
            size: 'xs',
            color: '#64748B',
            weight: 'bold',
          }, */
          ...descriptionLines.map((line) => ({
            type: 'text',
            text: line,
            size: 'sm',
            color: '#111827',
            wrap: true,
          })),
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '14px',
        backgroundColor: '#F8FAFC',
        contents: [
          {
            type: 'text',
            text: 'หากต้องการข้อมูลเพิ่มเติม กรุณาติดต่อทีมงาน',
            size: 'xs',
            color: '#64748B',
            wrap: true,
          },
        ],
      },
    },
  };
}

export async function sendLineNewsBroadcast(newsId: string) {
  const { data: news, error: newsError } = await supabaseAdmin
    .from('line_news_broadcasts')
    .select('id, company_id, seq, title, descriptions')
    .eq('id', newsId)
    .eq('is_deleted', false)
    .single();

  if (newsError || !news) throw new Error(newsError?.message || 'ไม่พบข่าวสาร LINE');

  const { data: recipients, error: recipientsError } = await supabaseAdmin
    .from('line_news_broadcast_recipients')
    .select('id, line_customer_id, line_customers(id, line_user_id)')
    .eq('company_id', news.company_id)
    .eq('line_news_broadcast_id', news.id)
    .eq('is_deleted', false);

  if (recipientsError) throw new Error(recipientsError.message);
  if (!recipients?.length) throw new Error('ยังไม่ได้เลือกผู้รับข่าวสาร');

  const flexMessage = buildLineNewsFlex(news);
  const failures: Array<{ lineCustomerId: string; error: string }> = [];
  const sentAt = new Date().toISOString();

  for (const recipient of recipients) {
    const lineCustomer = Array.isArray(recipient.line_customers) ? recipient.line_customers[0] : recipient.line_customers;
    const lineUserId = String(lineCustomer?.line_user_id || '').trim();
    const lineCustomerId = String(recipient.line_customer_id || '');

    if (!lineUserId) {
      failures.push({ lineCustomerId, error: 'ไม่พบ LINE user id' });
      await supabaseAdmin
        .from('line_news_broadcast_recipients')
        .update({ error_message: 'ไม่พบ LINE user id' })
        .eq('id', recipient.id);
      continue;
    }

    try {
      await pushLinePayload(lineUserId, [flexMessage]);
      await supabaseAdmin
        .from('line_news_broadcast_recipients')
        .update({ sent_at: sentAt, error_message: null })
        .eq('id', recipient.id);
      await supabaseAdmin.from('line_messages').insert({
        company_id: news.company_id,
        line_customer_id: lineCustomerId,
        direction: 'OUT',
        message_type: 'flex',
        message_text: news.title,
      });
    } catch (e) {
      const message = (e as Error).message;
      failures.push({ lineCustomerId, error: message });
      await supabaseAdmin
        .from('line_news_broadcast_recipients')
        .update({ error_message: message })
        .eq('id', recipient.id);
    }
  }

  await supabaseAdmin
    .from('line_news_broadcasts')
    .update({ status: failures.length ? 'PARTIAL' : 'SENT', sent_at: sentAt, flex_payload: flexMessage })
    .eq('id', news.id);

  return {
    ok: failures.length === 0,
    sent: recipients.length - failures.length,
    failed: failures.length,
    failures,
  };
}
