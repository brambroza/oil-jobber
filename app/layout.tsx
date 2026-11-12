import type { Metadata } from 'next';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v15-appRouter';
import AppThemeProvider from '@/components/layout/AppThemeProvider';

export const metadata: Metadata = {
  title: 'Oil Jobber Management Platform',
  description: 'ระบบจัดการงานขายน้ำมัน',
};

/**
 * Root layout. `AppRouterCacheProvider` collects Emotion styles during SSR and
 * flushes them into <head>, so server and client trees match on hydration.
 * `suppressHydrationWarning` on <html> ignores attributes injected by browser
 * extensions (e.g. `data-xt-extension-active`); it applies to that element only.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='th' suppressHydrationWarning>
      <body>
        <AppRouterCacheProvider options={{ key: 'css' }}>
          <AppThemeProvider>{children}</AppThemeProvider>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
