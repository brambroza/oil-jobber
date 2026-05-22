import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('user_id');
  if (!userId) return NextResponse.json({ error: 'user_id is required' }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from('users_profile')
    .select('id, company_id, full_name, role, avatar_url')
    .eq('id', userId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? null);
}
