import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireStaff } from '@/lib/auth/api-guard';
import { ALL_ROLES } from '@/lib/auth/permissions';
import { supabaseAdmin } from '@/lib/supabase/server';
import { parseBody, optionalText } from '@/lib/validation/common';

const PROFILE_COLUMNS = 'id, company_id, full_name, email, role, avatar_url, signature_url, created_at, updated_at, is_deleted';

const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email('อีเมลไม่ถูกต้อง'),
  password: z.string().min(8, 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'),
  full_name: z.string().trim().min(1, 'กรุณาระบุชื่อ'),
  role: z.enum(ALL_ROLES as [string, ...string[]]).default('SALES'),
  avatar_url: optionalText(1000),
});

/** Lists staff profiles of the caller's company. */
export async function GET() {
  const guard = await requireStaff('users');
  if (guard.response) return guard.response;
  const { ctx } = guard;

  const { data, error } = await supabaseAdmin
    .from('users_profile')
    .select(PROFILE_COLUMNS)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

/**
 * Creates a Supabase auth user plus a staff profile in one step.
 * Rolls the auth user back when the profile insert fails.
 */
export async function POST(req: NextRequest) {
  const guard = await requireStaff('users');
  if (guard.response) return guard.response;
  const { ctx } = guard;

  const parsed = parseBody(createUserSchema, await req.json());
  if (parsed.response) return parsed.response;
  const input = parsed.data;

  const created = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      portal_type: 'STAFF',
      full_name: input.full_name,
      company_id: ctx.companyId,
    },
  });

  if (created.error || !created.data.user) {
    return NextResponse.json({ error: created.error?.message || 'สร้างผู้ใช้ไม่สำเร็จ' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('users_profile')
    .insert({
      id: created.data.user.id,
      company_id: ctx.companyId,
      email: input.email,
      full_name: input.full_name,
      role: input.role,
      avatar_url: input.avatar_url ?? null,
      created_by: ctx.userId,
      updated_by: ctx.userId,
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    await supabaseAdmin.auth.admin.deleteUser(created.data.user.id);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
