import type { UserRole } from '@/types/database';

/**
 * Feature modules that can be gated per role. Keep this list in sync with the
 * sidebar menu (components/layout/DashboardShell.tsx) and API guards.
 */
export type AppModule =
  | 'dashboard'
  | 'orders'
  | 'customers'
  | 'prices'
  | 'accounting'
  | 'reports'
  | 'depots'
  | 'refineries'
  | 'vehicles'
  | 'oil-products'
  | 'ocr'
  | 'line'
  | 'settings'
  | 'users';

/** Role → allowed modules. `'*'` means every module. */
export const ROLE_MODULES: Record<UserRole, Array<AppModule | '*'>> = {
  SUPER_ADMIN: ['*'],
  ADMIN: ['*'],
  OWNER: ['dashboard', 'reports', 'accounting', 'orders', 'customers', 'prices'],
  /** ผู้จัดการฝ่ายขาย: เมนูเดียวกับ SALES แต่เห็นลูกค้าทุกราย เลือกพนักงานขายได้ และอนุมัติใบสั่งขายได้ */
  SALES_MANAGER: ['dashboard', 'orders', 'customers', 'prices', 'accounting', 'reports'],
  SALES: ['dashboard', 'orders', 'customers', 'prices', 'accounting', 'reports'],
  ACCOUNTING: ['dashboard', 'accounting', 'orders', 'customers', 'reports'],
  OPERATION: ['dashboard', 'orders', 'depots', 'refineries', 'vehicles'],
};

export const ALL_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'OWNER', 'SALES_MANAGER', 'SALES', 'ACCOUNTING', 'OPERATION'];

/** Roles allowed to approve an order (SUBMITTED/ADMIN_REVIEW → CONFIRMED), including over-credit approvals. */
export const ORDER_APPROVER_ROLES: UserRole[] = ['SUPER_ADMIN', 'ADMIN', 'SALES_MANAGER'];

/** True when the role may approve orders. */
export function canApproveOrders(role: string | null | undefined): boolean {
  return Boolean(role) && ORDER_APPROVER_ROLES.includes(role as UserRole);
}

/** True when the role may set credit limit and the admin price baseline on a customer. */
export function canEditCustomerCredit(role: string | null | undefined): boolean {
  return role !== 'SALES' && role !== 'SALES_MANAGER';
}

/**
 * Pure permission check, safe to import from client components.
 * @param role - role from `users_profile.role` (null/unknown → denied)
 * @param module - feature module being accessed
 */
export function canAccess(role: string | null | undefined, module: AppModule): boolean {
  if (!role) return false;
  const allowed = ROLE_MODULES[role as UserRole] ?? [];
  return allowed.includes('*') || allowed.includes(module);
}

/** True when the role can manage every module (admin-level). */
export function isAdminRole(role: string | null | undefined): boolean {
  return role === 'SUPER_ADMIN' || role === 'ADMIN';
}
