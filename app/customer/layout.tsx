import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { getUserContext } from '@/lib/auth/user-context';

export default async function CustomerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const ctx = await getUserContext(user.id);
  if (!ctx.isCustomerUser) {
    if (ctx.isDashboardUser) redirect('/dashboard');
    redirect('/login');
  }

  return <>{children}</>;
}
