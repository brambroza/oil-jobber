import { redirect } from 'next/navigation';
import DashboardShell from '@/components/layout/DashboardShell';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  return <DashboardShell>{children}</DashboardShell>;
}
