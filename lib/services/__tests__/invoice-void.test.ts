import { beforeEach, describe, expect, it, vi } from 'vitest';

type Op = { table: string; payload?: unknown; filters: Array<[string, string, unknown]> };

const ops: Op[] = [];
let result: { data: unknown; error: { message: string } | null } = { data: [], error: null };

/** Minimal chainable stand-in for the Supabase query builder. */
function builder(table: string) {
  const op: Op = { table, filters: [] };
  ops.push(op);
  const chain: any = {
    update: (payload: unknown) => { op.payload = payload; return chain; },
    eq: (col: string, val: unknown) => { op.filters.push(['eq', col, val]); return chain; },
    neq: (col: string, val: unknown) => { op.filters.push(['neq', col, val]); return chain; },
    select: () => chain,
    then: (resolve: (v: unknown) => void) => resolve(result),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({ supabaseAdmin: { from: (table: string) => builder(table) } }));

import { voidInvoicesForOrder } from '../invoice-void';

beforeEach(() => {
  ops.length = 0;
  result = { data: [{ invoice_no: 'IV-260022' }], error: null };
});

describe('voidInvoicesForOrder', () => {
  it('cancels and soft-deletes only the active invoices of that order', async () => {
    const out = await voidInvoicesForOrder('c1', 'o1', 'u1');
    expect(out).toEqual({ voided: ['IV-260022'] });
    expect(ops).toHaveLength(1);
    expect(ops[0].table).toBe('invoices');
    expect(ops[0].payload).toEqual({ is_deleted: true, status: 'CANCELLED', updated_by: 'u1' });
    expect(ops[0].filters).toEqual(expect.arrayContaining([
      ['eq', 'company_id', 'c1'],
      ['eq', 'sale_order_id', 'o1'],
      ['eq', 'is_deleted', false],
      ['neq', 'status', 'CANCELLED'],
    ]));
  });

  it('returns an empty list when the order has no invoice', async () => {
    result = { data: [], error: null };
    expect(await voidInvoicesForOrder('c1', 'o1', 'u1')).toEqual({ voided: [] });
  });

  it('passes the database error through', async () => {
    result = { data: null, error: { message: 'boom' } };
    expect(await voidInvoicesForOrder('c1', 'o1', 'u1')).toEqual({ error: 'boom' });
  });

  it('rejects a missing order id without touching the database', async () => {
    expect(await voidInvoicesForOrder('c1', '', 'u1')).toHaveProperty('error');
    expect(ops).toHaveLength(0);
  });
});
