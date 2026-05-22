import { supabaseAdmin } from '@/lib/supabase/server';

export async function getUserRole(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from('users_profile').select('role').eq('id', userId).single();
  if (error) return null;
  return data.role as string;
}

export function canAccess(role: string, module: string): boolean {
  const matrix: Record<string, string[]> = {
    SUPER_ADMIN: ['*'],
    ADMIN: ['*'],
    OWNER: ['dashboard', 'reports', 'accounting', 'orders'],
    SALES: ['orders', 'customers', 'prices', 'line'],
    ACCOUNTING: ['accounting', 'orders'],
    OPERATION: ['orders', 'depots'],
  };
  const allowed = matrix[role] ?? [];
  return allowed.includes('*') || allowed.includes(module);
}
