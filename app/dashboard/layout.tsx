import { redirect } from 'next/navigation';
import DashboardShell from '@/components/layout/DashboardShell';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { CurrentUser } from '@/components/layout/CurrentUserProvider';
import type { UserRole } from '@/types/database';
import { ALL_ROLES } from '@/lib/auth/permissions';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const [profileRes, portalRes] = await Promise.all([
    supabaseAdmin
      .from('users_profile')
      .select('id, company_id, full_name, email, role, avatar_url, is_deleted')
      .eq('id', user.id)
      .maybeSingle(),
    supabaseAdmin
      .from('customer_portal_users')
      .select('is_active')
      .eq('auth_user_id', user.id)
      .eq('is_active', true)
      .maybeSingle(),
  ]);

  const profile = profileRes.data && !profileRes.data.is_deleted ? profileRes.data : null;
  const role = profile && (ALL_ROLES as string[]).includes(String(profile.role)) ? (profile.role as UserRole) : null;

  if (!profile || !role) {
    if (portalRes.data?.is_active) redirect('/customer');
    redirect('/login');
  }

  const currentUser: CurrentUser = {
    userId: profile.id,
    role,
    fullName: profile.full_name ?? (user.user_metadata?.full_name as string | undefined) ?? null,
    email: profile.email ?? user.email ?? null,
    avatarUrl: profile.avatar_url ?? null,
    companyId: profile.company_id,
  };

  return <DashboardShell currentUser={currentUser}>{children}</DashboardShell>;
}
