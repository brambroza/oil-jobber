import type { Metadata } from 'next';
import AppThemeProvider from '@/components/layout/AppThemeProvider';

export const metadata: Metadata = {
  title: 'Oil Jobber Management Platform',
  description: 'ระบบจัดการงานขายน้ำมัน',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='th'>
      <body>
        <AppThemeProvider>{children}</AppThemeProvider>
      </body>
    </html>
  );
}
