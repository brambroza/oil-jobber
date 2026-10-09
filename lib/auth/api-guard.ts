import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { supabaseAdmin } from '@/lib/supabase/server';
import { canAccess, type AppModule } from '@/lib/auth/permissions';
import type { UserRole } from '@/types/database';

export type StaffContext = {
  userId: string;
  role: UserRole;
  companyId: string;
  fullName: string | null;
  email: string | null;
};

export type GuardResult = { ctx: StaffContext; response?: undefined } | { ctx?: undefined; response: NextResponse };

/**
 * Resolves the logged-in staff user from the request cookies and checks the
 * role against an optional module. Company id always comes from the profile,
 * never from the request, so routes must use `ctx.companyId`.
 *
 * @param module - module the route belongs to; omit to only require login
 * @returns `{ ctx }` on success or `{ response }` (401/403) to return as-is
 */
export async function requireStaff(module?: AppModule): Promise<GuardResult> {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { response: NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('users_profile')
    .select('id, company_id, role, full_name, email, is_deleted')
    .eq('id', authData.user.id)
    .maybeSingle();

  if (profileError) {
    return { response: NextResponse.json({ error: profileError.message }, { status: 400 }) };
  }
  if (!profile || profile.is_deleted) {
    return { response: NextResponse.json({ error: 'บัญชีนี้ไม่มีสิทธิ์ใช้งานระบบหลังบ้าน' }, { status: 403 }) };
  }

  const role = String(profile.role || '') as UserRole;
  if (module && !canAccess(role, module)) {
    return { response: NextResponse.json({ error: 'ไม่มีสิทธิ์ใช้งานโมดูลนี้' }, { status: 403 }) };
  }

  return {
    ctx: {
      userId: profile.id,
      role,
      companyId: profile.company_id,
      fullName: profile.full_name ?? null,
      email: profile.email ?? authData.user.email ?? null,
    },
  };
}
