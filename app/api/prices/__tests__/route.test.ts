import { beforeEach, describe, expect, it, vi } from 'vitest';

/** PostgREST response cap that the route must page around. */
const MAX_ROWS = 1000;

type ItemRow = { oil_base_price_id: string };

let baseRows: Array<Record<string, unknown>> = [];
let itemRows: ItemRow[] = [];

/**
 * Minimal chainable stand-in for the Supabase query builder. Base-price
 * queries resolve to `baseRows`; item queries honour `.in()` and `.range()`
 * and never return more than MAX_ROWS rows, like PostgREST.
 */
function makeQuery(table: string) {
  let ids: string[] | null = null;
  let range: [number, number] | null = null;
  const query: any = {
    select: () => query,
    eq: () => query,
    order: () => query,
    in: (_col: string, values: string[]) => {
      ids = values;
      return query;
    },
    range: (from: number, to: number) => {
      range = [from, to];
      return query;
    },
    then: (resolve: (value: unknown) => unknown) => {
      if (table === 'oil_base_prices') return resolve({ data: baseRows, error: null });
      const matched = itemRows.filter((row) => !ids || ids.includes(row.oil_base_price_id));
      const [from, to] = range ?? [0, matched.length - 1];
      const page = matched.slice(from, Math.min(to + 1, from + MAX_ROWS));
      return resolve({ data: page, error: null });
    },
  };
  return query;
}

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: { from: (table: string) => makeQuery(table) },
}));

vi.mock('@/lib/auth/api-guard', () => ({
  requireStaff: async () => ({ ctx: { companyId: 'company-1' } }),
}));

/**
 * Builds `count` item rows for one price round.
 *
 * @param basePriceId - round id the items belong to
 * @param count - number of items to create
 * @returns item rows
 */
function itemsFor(basePriceId: string, count: number): ItemRow[] {
  return Array.from({ length: count }, () => ({ oil_base_price_id: basePriceId }));
}

describe('GET /api/prices item_count', () => {
  beforeEach(() => {
    baseRows = [
      { id: 'round-a', refineries: { name: 'Refinery A' } },
      { id: 'round-b', refineries: { name: 'Refinery B' } },
      { id: 'round-c', refineries: null },
    ];
    itemRows = [];
  });

  it('counts every item when the total exceeds the PostgREST row cap', async () => {
    itemRows = [...itemsFor('round-a', 1200), ...itemsFor('round-b', 5)];
    const { GET } = await import('../route');

    const res = await GET({} as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.map((r: any) => [r.id, r.item_count])).toEqual([
      ['round-a', 1200],
      ['round-b', 5],
      ['round-c', 0],
    ]);
  });

  it('handles a total that is an exact multiple of the page size', async () => {
    itemRows = [...itemsFor('round-a', 600), ...itemsFor('round-b', 400)];
    const { GET } = await import('../route');

    const body = await (await GET({} as any)).json();

    expect(body.find((r: any) => r.id === 'round-a').item_count).toBe(600);
    expect(body.find((r: any) => r.id === 'round-b').item_count).toBe(400);
  });

  it('maps refinery_name with a dash fallback', async () => {
    const { GET } = await import('../route');

    const body = await (await GET({} as any)).json();

    expect(body.map((r: any) => r.refinery_name)).toEqual(['Refinery A', 'Refinery B', '-']);
  });
});
