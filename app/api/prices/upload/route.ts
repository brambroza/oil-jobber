import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(req: NextRequest) {
  const guard = await requireStaff('ocr');
  if (guard.response) return guard.response;
  const body = await req.json();
  const { data, error } = await supabaseAdmin.from('price_ocr_uploads').insert(body).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
