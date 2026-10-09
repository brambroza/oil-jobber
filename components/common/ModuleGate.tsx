import type { ReactNode } from 'react';
import { Alert, Button, Stack } from '@mui/material';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server-client';
import { supabaseAdmin } from '@/lib/supabase/server';
import { canAccess, type AppModule } from '@/lib/auth/permissions';
import { PageScaffold } from '@/components/common/PageScaffold';

/**
 * Server-side page gate used by segment layouts (e.g. app/dashboard/settings/layout.tsx).
 * Renders the children only when the logged-in staff role may use the module.
 */
export async function ModuleGate({ module, children }: { module: AppModule; children: ReactNode }) {
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  let role: string | null = null;
  if (authData.user) {
    const { data } = await supabaseAdmin
      .from('users_profile')
      .select('role, is_deleted')
      .eq('id', authData.user.id)
      .maybeSingle();
    role = data && !data.is_deleted ? String(data.role) : null;
  }

  if (canAccess(role, module)) return <>{children}</>;

  return (
    <PageScaffold title='ไม่มีสิทธิ์เข้าถึง' description='บัญชีของคุณไม่มีสิทธิ์ใช้งานเมนูนี้'>
      <Stack spacing={1.5} alignItems='flex-start'>
        <Alert severity='warning'>หากต้องการใช้งาน กรุณาติดต่อผู้ดูแลระบบเพื่อปรับบทบาทผู้ใช้</Alert>
        <Button component={Link} href='/dashboard' variant='outlined'>กลับหน้าแดชบอร์ด</Button>
      </Stack>
    </PageScaffold>
  );
}
