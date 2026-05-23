import { redirect } from 'next/navigation';
import DashboardShell from '@/components/layout/DashboardShell';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { getUserContext } from '@/lib/auth/user-context';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const ctx = await getUserContext(user.id);
  if (!ctx.isDashboardUser) {
    if (ctx.isCustomerUser) redirect('/customer');
    redirect('/login');
  }

  return <DashboardShell>{children}</DashboardShell>;
}
