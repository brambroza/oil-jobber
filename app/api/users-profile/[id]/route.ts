import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/api-guard';
import { ALL_ROLES } from '@/lib/auth/permissions';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody, optionalSignatureDataUri, optionalString, optionalText, uuid } from '@/lib/validation/common';

const PROFILE_COLUMNS = 'id, company_id, full_name, email, role, avatar_url, signature_url, created_at, updated_at, is_deleted';

const updateUserSchema = z.object({
  full_name: optionalText(200),
  role: z.enum(ALL_ROLES as [string, ...string[]]).optional(),
  avatar_url: optionalText(1000),
  signature_url: optionalSignatureDataUri,
  email: optionalString(z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง')),
  password: optionalString(z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร')),
});

/** Updates profile fields; optionally resets email/password on the auth user. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('users');
  if (guard.response) return guard.response;
  const { ctx } = guard;

  const { id } = await params;
  if (!uuid.safeParse(id).success) return NextResponse.json({ error: 'รหัสผู้ใช้ไม่ถูกต้อง' }, { status: 400 });

  const parsed = parseBody(updateUserSchema, await req.json());
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  if (input.email || input.password) {
    const authUpdate = await supabaseAdmin.auth.admin.updateUserById(id, {
      ...(input.email ? { email: input.email, email_confirm: true } : {}),
      ...(input.password ? { password: input.password } : {}),
    });
    if (authUpdate.error) return NextResponse.json({ error: authUpdate.error.message }, { status: 400 });
  }

  const update: Record<string, unknown> = { updated_by: ctx.userId };
  if (input.full_name !== undefined) update.full_name = input.full_name;
  if (input.role !== undefined) update.role = input.role;
  if (input.avatar_url !== undefined) update.avatar_url = input.avatar_url;
  if (input.signature_url !== undefined) update.signature_url = input.signature_url;
  if (input.email !== undefined) update.email = input.email;

  const { data, error } = await supabaseAdmin
    .from('users_profile')
    .update(update)
    .eq('id', id)
    .eq('company_id', ctx.companyId)
    .select(PROFILE_COLUMNS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data);
}

/** Soft-deletes the profile and blocks the auth login. */
export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireStaff('users');
  if (guard.response) return guard.response;
  const { ctx } = guard;

  const { id } = await params;
  if (id === ctx.userId) return NextResponse.json({ error: 'ไม่สามารถปิดใช้งานบัญชีของตัวเองได้' }, { status: 422 });

  const { error } = await supabaseAdmin
    .from('users_profile')
    .update({ is_deleted: true, updated_by: ctx.userId })
    .eq('id', id)
    .eq('company_id', ctx.companyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // 100 years ≈ permanent ban; the profile row keeps the audit trail.
  await supabaseAdmin.auth.admin.updateUserById(id, { ban_duration: '876000h' });

  return NextResponse.json({ ok: true });
}
