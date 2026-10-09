import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/server';
import type { StaffContext } from '@/lib/auth/api-guard';

/**
 * Row-level visibility for customers. Admin/owner/accounting/operation see
 * every customer of the company (`null`). SALES only sees customers whose
 * `customers.sales_user_id` is themselves, so the admin assigns visibility by
 * setting the default salesperson on the customer.
 */
export type CustomerScope = string[] | null;

/** True when the role is limited to its own customers. */
export function isScopedRole(role: StaffContext['role']): boolean {
  return role === 'SALES';
}

/**
 * Loads the customer ids the caller may see. Returns `null` for unrestricted
 * roles so callers can skip the filter entirely.
 */
export async function loadCustomerScope(ctx: StaffContext): Promise<CustomerScope | { error: string }> {
  if (!isScopedRole(ctx.role)) return null;
  const { data, error } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .eq('sales_user_id', ctx.userId);
  if (error) return { error: error.message };
  return (data ?? []).map((row) => row.id as string);
}

/** Checks one customer id against a loaded scope. */
export function inCustomerScope(scope: CustomerScope, customerId: string | null | undefined): boolean {
  if (scope === null) return true;
  if (!customerId) return false;
  return scope.includes(customerId);
}

/**
 * Checks whether the caller may access one customer. Unrestricted roles pass
 * without a query; SALES must be the customer's default salesperson.
 */
export async function canAccessCustomer(ctx: StaffContext, customerId: string | null | undefined): Promise<boolean> {
  if (!isScopedRole(ctx.role)) return true;
  if (!customerId) return false;
  const { data } = await supabaseAdmin
    .from('customers')
    .select('id')
    .eq('id', customerId)
    .eq('company_id', ctx.companyId)
    .eq('is_deleted', false)
    .eq('sales_user_id', ctx.userId)
    .maybeSingle();
  return Boolean(data);
}

/** Checks whether the caller may access the customer behind one order. */
export async function canAccessOrder(ctx: StaffContext, orderId: string | null | undefined): Promise<boolean> {
  if (!isScopedRole(ctx.role)) return true;
  if (!orderId) return false;
  const { data } = await supabaseAdmin
    .from('sale_orders')
    .select('customer_id')
    .eq('id', orderId)
    .eq('company_id', ctx.companyId)
    .maybeSingle();
  return canAccessCustomer(ctx, data?.customer_id ?? null);
}

/** 403 response used whenever a scoped user touches a customer outside their scope. */
export function customerForbidden(): NextResponse {
  return NextResponse.json({ error: 'ไม่มีสิทธิ์เข้าถึงลูกค้ารายนี้' }, { status: 403 });
}

/**
 * Narrows a list of rows to those whose customer is in scope. Rows without a
 * customer are dropped for scoped roles.
 */
export function filterByCustomerScope<T>(rows: T[], scope: CustomerScope, pick: (row: T) => string | null | undefined): T[] {
  if (scope === null) return rows;
  return rows.filter((row) => inCustomerScope(scope, pick(row)));
}
