import { supabaseAdmin } from '@/lib/supabase/server';
import { ALL_ROLES } from '@/lib/auth/permissions';

const dashboardRoles = new Set<string>(ALL_ROLES);

export type UserContext = {
  isDashboardUser: boolean;
  dashboardRole: string | null;
  isCustomerUser: boolean;
};

/**
 * Looks up a staff profile role by auth user id.
 * @returns role string or null when the profile does not exist / is deleted
 */
export async function getUserRole(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from('users_profile')
    .select('role')
    .eq('id', userId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (error || !data) return null;
  return String(data.role);
}

/**
 * Determines whether an auth user is a dashboard (staff) user, a customer portal
 * user, or both.
 */
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

/** Default landing page for a resolved user context. */
export function getDefaultHomeByContext(ctx: UserContext): '/dashboard' | '/customer' | '/login' {
  if (ctx.isDashboardUser) return '/dashboard';
  if (ctx.isCustomerUser) return '/customer';
  return '/login';
}
