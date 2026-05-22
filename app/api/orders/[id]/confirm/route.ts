import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { refinery_booking_number } = await req.json();
  const { data, error } = await supabaseAdmin.from('sale_orders').update({ order_status: 'CONFIRMED', refinery_booking_number }).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
