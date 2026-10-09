'use client';

import Link from 'next/link';
import { Alert, Button, Stack } from '@mui/material';
import type { ReactNode } from 'react';
import { canAccess, type AppModule } from '@/lib/auth/permissions';
import { useCurrentUser } from '@/components/layout/CurrentUserProvider';
import { PageScaffold } from '@/components/common/PageScaffold';

/**
 * Client-side page gate: renders children only when the current role may use
 * the module, otherwise a friendly "no access" page. API routes enforce the
 * same matrix server-side.
 */
export function RequireModule({ module, children }: { module: AppModule; children: ReactNode }) {
  const user = useCurrentUser();
  if (user && canAccess(user.role, module)) return <>{children}</>;

  return (
    <PageScaffold title='ไม่มีสิทธิ์เข้าถึง' description='บัญชีของคุณไม่มีสิทธิ์ใช้งานเมนูนี้'>
      <Stack spacing={1.5} alignItems='flex-start'>
        <Alert severity='warning'>หากต้องการใช้งาน กรุณาติดต่อผู้ดูแลระบบเพื่อปรับบทบาทผู้ใช้</Alert>
        <Button component={Link} href='/dashboard' variant='outlined'>กลับหน้าแดชบอร์ด</Button>
      </Stack>
    </PageScaffold>
  );
}
