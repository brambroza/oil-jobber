import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import { pushLineMessage } from '@/lib/services/line';

export async function POST(req: NextRequest) {
  const { company_id, title, message, recipients } = await req.json();
  const { data: b, error } = await supabaseAdmin.from('line_broadcasts').insert({ company_id, title, message, status: 'SENT' }).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  for (const r of recipients as Array<{ lineUserId: string; lineCustomerId: string }>) {
    await pushLineMessage(r.lineUserId, message);
    await supabaseAdmin.from('line_broadcast_recipients').insert({ company_id, line_broadcast_id: b.id, line_customer_id: r.lineCustomerId, sent_at: new Date().toISOString() });
  }
  return NextResponse.json({ ok: true, broadcast: b });
}
