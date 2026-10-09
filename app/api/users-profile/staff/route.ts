import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';

/** Lightweight staff directory (id, name, role) for pickers; any logged-in staff may read it. */
export async function GET() {
  const guard = await requireStaff();
  if (guard.response) return guard.response;

  const { data, error } = await supabaseAdmin
    .from('users_profile')
    .select('id, full_name, email, role')
    .eq('company_id', guard.ctx.companyId)
    .eq('is_deleted', false)
    .order('full_name', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json((data ?? []).map((row) => ({ ...row, full_name: row.full_name || row.email || '' })));
}
