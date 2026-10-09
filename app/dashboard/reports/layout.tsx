import type { ReactNode } from 'react';
import { ModuleGate } from '@/components/common/ModuleGate';

export default function GatedLayout({ children }: { children: ReactNode }) {
  return <ModuleGate module='reports'>{children}</ModuleGate>;
}
