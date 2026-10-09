'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { UserRole } from '@/types/database';

export type CurrentUser = {
  userId: string;
  role: UserRole | null;
  fullName: string | null;
  email: string | null;
  avatarUrl: string | null;
  companyId: string;
};

const CurrentUserContext = createContext<CurrentUser | null>(null);

/**
 * Provides the logged-in staff profile (resolved server-side in the dashboard
 * layout) to every client component under the dashboard shell.
 */
export function CurrentUserProvider({ value, children }: { value: CurrentUser; children: ReactNode }) {
  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
}

/** Returns the current staff user; null outside the dashboard shell. */
export function useCurrentUser(): CurrentUser | null {
  return useContext(CurrentUserContext);
}
