import { beforeEach, describe, expect, it, vi } from 'vitest';

let baseRows: Array<Record<string, unknown>> = [];
let baseError: { message: string } | null = null;
let filters: Array<[string, unknown]> = [];
let selectedColumns = '';
let tablesQueried: string[] = [];

/**
 * Minimal chainable stand-in for the Supabase query builder. Records the
 * select list and filters, then resolves to `baseRows` / `baseError`.
 */
function makeQuery(table: string) {
  tablesQueried.push(table);
  const query: any = {
    select: (columns: string) => {
      selectedColumns = columns;
      return query;
    },
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return query;
    },
    order: () => query,
    then: (resolve: (value: unknown) => unknown) => resolve({ data: baseRows, error: baseError }),
  };
  return query;
}

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: (table: string) => makeQuery(table) },
}));

vi.mock('@/lib/auth/api-guard', () => ({
  requireStaff: async () => ({ ctx: { companyId: 'company-1' } }),
}));

describe('GET /api/prices item_count', () => {
  beforeEach(() => {
    baseRows = [
      { id: 'round-a', refineries: { name: 'Refinery A' }, oil_price_items: [{ count: 1200 }] },
      { id: 'round-b', refineries: { name: 'Refinery B' }, oil_price_items: [{ count: 5 }] },
      { id: 'round-c', refineries: null, oil_price_items: [{ count: 0 }] },
    ];
    baseError = null;
    filters = [];
    selectedColumns = '';
    tablesQueried = [];
  });

  it('maps the embedded count to item_count and drops the raw embed', async () => {
    const { GET } = await import('../route');

    const res = await GET({} as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.map((r: any) => [r.id, r.item_count])).toEqual([
      ['round-a', 1200],
      ['round-b', 5],
      ['round-c', 0],
    ]);
    expect(body[0]).not.toHaveProperty('oil_price_items');
  });

  it('counts only non-deleted items in one query, scoped to the company', async () => {
    const { GET } = await import('../route');

    await GET({} as any);

    expect(tablesQueried).toEqual(['oil_base_prices']);
    expect(selectedColumns).toContain('oil_price_items(count)');
    expect(filters).toContainEqual(['company_id', 'company-1']);
    expect(filters).toContainEqual(['is_deleted', false]);
    expect(filters).toContainEqual(['oil_price_items.is_deleted', false]);
  });

  it('falls back to 0 when the embedded count is missing', async () => {
    baseRows = [{ id: 'round-a', refineries: null }];
    const { GET } = await import('../route');

    const body = await (await GET({} as any)).json();

    expect(body[0].item_count).toBe(0);
  });

  it('maps refinery_name with a dash fallback', async () => {
    const { GET } = await import('../route');

    const body = await (await GET({} as any)).json();

    expect(body.map((r: any) => r.refinery_name)).toEqual(['Refinery A', 'Refinery B', '-']);
  });

  it('returns 400 with the error message when the query fails', async () => {
    baseError = { message: 'boom' };
    const { GET } = await import('../route');

    const res = await GET({} as any);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'boom' });
  });
});
