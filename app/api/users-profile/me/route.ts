import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/api-guard';
import { supabaseAdmin } from '@/lib/supabase/server';
import { optionalSignatureDataUri, parseBody } from '@/lib/validation/common';

const ME_COLUMNS = 'id, company_id, full_name, role, avatar_url, signature_url, email';

const updateMeSchema = z.object({
  /** ลายเซ็นของตัวเอง (data URI PNG/JPEG) ส่ง null เพื่อลบ */
  signature_url: optionalSignatureDataUri,
});

/** Returns the logged-in staff profile (resolved from the session cookie). */
export async function GET() {
  const guard = await requireStaff();
  if (guard.response) return guard.response;
  const { ctx } = guard;

  const { data, error } = await supabaseAdmin
    .from('users_profile')
    .select(ME_COLUMNS)
    .eq('id', ctx.userId)
    .eq('is_deleted', false)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? null);
}

/**
 * Lets any staff user update their own signature image. Other profile fields
 * stay admin-only through `/api/users-profile/[id]`.
 */
export async function PATCH(req: NextRequest) {
  const guard = await requireStaff();
  if (guard.response) return guard.response;
  const { ctx } = guard;

  const parsed = parseBody(updateMeSchema, await req.json());
  if (parsed.response) return parsed.response;
  if (parsed.data.signature_url === undefined) return NextResponse.json({ error: 'ไม่มีข้อมูลที่ต้องการบันทึก' }, { status: 422 });

  const { data, error } = await supabaseAdmin
    .from('users_profile')
    .update({ signature_url: parsed.data.signature_url, updated_by: ctx.userId })
    .eq('id', ctx.userId)
    .eq('company_id', ctx.companyId)
    .select(ME_COLUMNS)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}
