import { supabaseAdmin } from '@/lib/supabase/server';

const dashboardRoles = new Set(['SUPER_ADMIN', 'ADMIN', 'SALES', 'ACCOUNTING', 'OPERATION', 'OWNER']);

export type UserContext = {
  isDashboardUser: boolean;
  dashboardRole: string | null;
  isCustomerUser: boolean;
};

export async function getUserContext(userId: string): Promise<UserContext> {
  const [profileRes, customerPortalRes] = await Promise.all([
    supabaseAdmin
      .from('users_profile')
      .select('role, is_deleted')
      .eq('id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('customer_portal_users')
      .select('is_active')
      .eq('auth_user_id', userId)
      .eq('is_active', true)
      .maybeSingle(),
  ]);

  const role = !profileRes.error && profileRes.data && !profileRes.data.is_deleted
    ? String(profileRes.data.role || '').trim()
    : '';
  const isDashboardUser = Boolean(role && dashboardRoles.has(role));
  const isCustomerUser = Boolean(!customerPortalRes.error && customerPortalRes.data?.is_active);

  return {
    isDashboardUser,
    dashboardRole: isDashboardUser ? role : null,
    isCustomerUser,
  };
}

export function getDefaultHomeByContext(ctx: UserContext): '/dashboard' | '/customer' | '/login' {
  if (ctx.isDashboardUser) return '/dashboard';
  if (ctx.isCustomerUser) return '/customer';
  return '/login';
}

