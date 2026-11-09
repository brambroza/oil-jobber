import { beforeEach, describe, expect, it, vi } from 'vitest';

type Op = { table: string; op: 'select' | 'update' | 'insert'; payload?: unknown; filters: Array<[string, unknown]> };

const ops: Op[] = [];
let orderRow: Record<string, unknown> | null = null;
let quotationRow: Record<string, unknown> | null = null;

/** Minimal chainable stand-in for the Supabase query builder. */
function builder(table: string) {
  const op: Op = { table, op: 'select', filters: [] };
  ops.push(op);
  const chain: any = {
    select: () => chain,
    eq: (col: string, val: unknown) => { op.filters.push([col, val]); return chain; },
    in: (col: string, val: unknown) => { op.filters.push([col, val]); return chain; },
    order: () => chain,
    limit: () => chain,
    update: (payload: unknown) => { op.op = 'update'; op.payload = payload; return chain; },
    insert: (payload: unknown) => { op.op = 'insert'; op.payload = payload; return chain; },
    maybeSingle: async () => ({ data: table === 'sale_orders' ? orderRow : quotationRow, error: null }),
    then: (resolve: (v: unknown) => void) => resolve({ data: null, error: null }),
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({ supabaseAdmin: { from: (table: string) => builder(table) } }));
const loadOrderDocumentData = vi.fn();
vi.mock('@/lib/documents/from-order', () => ({ loadOrderDocumentData: (...args: unknown[]) => loadOrderDocumentData(...args) }));

import { decideQuotation, quotationMatchesOrder } from '../quotations';

const TODAY = '2026-11-09';

beforeEach(() => {
  ops.length = 0;
  orderRow = { id: 'o1', order_no: 'SO-1', order_status: 'DRAFT', quotation_stage: 'PENDING' };
  quotationRow = { id: 'q1', quotation_no: 'QT-1', status: 'ISSUED', valid_until: '2026-11-15', total_amount: 32100 };
  loadOrderDocumentData.mockReset().mockResolvedValue({ totals: { net_incl_vat: 32100 } });
});

const updates = (table: string) => ops.filter((o) => o.table === table && o.op === 'update').map((o) => o.payload as Record<string, unknown>);

describe('quotationMatchesOrder', () => {
  it('compares to the satang', () => {
    expect(quotationMatchesOrder('32100.00', 32100)).toBe(true);
    expect(quotationMatchesOrder(32100, 32100.004)).toBe(true);
    expect(quotationMatchesOrder(32100, 32100.01)).toBe(false);
  });
});

describe('decideQuotation', () => {
  it('converts: quotation ACCEPTED, order SUBMITTED + CONVERTED', async () => {
    const result = await decideQuotation('c1', 'u1', 'o1', 'convert', null, TODAY);
    expect(result).toMatchObject({ order_status: 'SUBMITTED', order_no: 'SO-1', quotation_no: 'QT-1' });
    expect(updates('quotations')[0]).toMatchObject({ status: 'ACCEPTED', decided_by: 'u1' });
    expect(updates('sale_orders')[0]).toMatchObject({ quotation_stage: 'CONVERTED', order_status: 'SUBMITTED', quotation_converted_by: 'u1' });
    expect(ops.some((o) => o.table === 'sale_order_status_logs' && o.op === 'insert')).toBe(true);
  });

  it('refuses to convert an expired quotation', async () => {
    quotationRow = { ...quotationRow, valid_until: '2026-11-08' };
    const result = await decideQuotation('c1', 'u1', 'o1', 'convert', null, TODAY);
    expect(result).toMatchObject({ status: 422 });
    expect(updates('sale_orders')).toHaveLength(0);
  });

  it('refuses to convert when the order changed after the quotation', async () => {
    loadOrderDocumentData.mockResolvedValue({ totals: { net_incl_vat: 33000 } });
    const result = await decideQuotation('c1', 'u1', 'o1', 'convert', null, TODAY);
    expect(result).toMatchObject({ status: 409 });
    expect(updates('quotations')).toHaveLength(0);
  });

  it('refuses to convert before a quotation number was issued', async () => {
    quotationRow = null;
    expect(await decideQuotation('c1', 'u1', 'o1', 'convert', null, TODAY)).toMatchObject({ status: 422 });
  });

  it('rejects: quotation REJECTED with reason, order CANCELLED + CLOSED', async () => {
    const result = await decideQuotation('c1', 'u1', 'o1', 'reject', 'แพงไป', TODAY);
    expect(result).toMatchObject({ order_status: 'CANCELLED' });
    expect(updates('quotations')[0]).toMatchObject({ status: 'REJECTED', decision_note: 'แพงไป' });
    expect(updates('sale_orders')[0]).toMatchObject({ quotation_stage: 'CLOSED', order_status: 'CANCELLED' });
  });

  it('cancels a quotation even without an issued number', async () => {
    quotationRow = null;
    const result = await decideQuotation('c1', 'u1', 'o1', 'cancel', null, TODAY);
    expect(result).toMatchObject({ order_status: 'CANCELLED' });
    expect(updates('quotations')).toHaveLength(0);
    expect(updates('sale_orders')[0]).toMatchObject({ quotation_stage: 'CLOSED' });
  });

  it('only acts on pending quotations', async () => {
    orderRow = { ...orderRow, quotation_stage: 'CONVERTED' };
    expect(await decideQuotation('c1', 'u1', 'o1', 'reject', null, TODAY)).toMatchObject({ status: 409 });
    orderRow = { ...orderRow, quotation_stage: null };
    expect(await decideQuotation('c1', 'u1', 'o1', 'convert', null, TODAY)).toMatchObject({ status: 409 });
    orderRow = null;
    expect(await decideQuotation('c1', 'u1', 'o1', 'convert', null, TODAY)).toMatchObject({ status: 404 });
  });
});
