import { NextRequest, NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody } from '@/lib/validation/common';
import { companyPatchSchema } from '@/lib/validation/accounting';

const COMPANY_COLUMNS = 'id, name, tax_id, branch, address, phone, email, logo_url, delivery_fee_surcharge_per_liter';

/** Seller info of the caller's company (used on printed documents). */
export async function GET() {
  const guard = await requireStaff();
  if (guard.response) return guard.response;
  const { data, error } = await supabaseAdmin.from('companies').select(COMPANY_COLUMNS).eq('id', guard.ctx.companyId).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

/** Updates seller info (settings module). */
export async function PATCH(req: NextRequest) {
  const guard = await requireStaff('settings');
  if (guard.response) return guard.response;
  const parsed = parseBody(companyPatchSchema, await req.json());
  if (parsed.response) return parsed.response;

  const { data, error } = await supabaseAdmin
    .from('companies')
    .update(parsed.data)
    .eq('id', guard.ctx.companyId)
    .select(COMPANY_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
