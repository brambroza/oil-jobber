import { NextResponse } from 'next/server';
import { requireStaff } from '@/lib/auth/api-guard';
import { loadOutstandingRows } from '@/lib/services/outstanding';
import { loadCustomerScope } from '@/lib/services/customer-scope';

/** Orders with an outstanding balance (total incl. delivery fee minus payments). */
export async function GET() {
  const guard = await requireStaff('accounting');
  if (guard.response) return guard.response;
  const scope = await loadCustomerScope(guard.ctx);
  if (scope && 'error' in scope) return NextResponse.json({ error: scope.error }, { status: 400 });
  const rows = await loadOutstandingRows(guard.ctx.companyId, { customerIds: scope });
  if ('error' in rows) return NextResponse.json({ error: rows.error }, { status: 400 });
  return NextResponse.json(rows);
}
