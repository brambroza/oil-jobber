import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const canAccessOrder = vi.fn();
const maybeSingle = vi.fn();
const update = vi.fn();

vi.mock('@/lib/auth/api-guard', () => ({
  requireStaff: vi.fn(async () => ({ ctx: { userId: 'u1', role: 'SALES', companyId: 'c1', fullName: null, email: null } })),
}));
vi.mock('@/lib/services/customer-scope', () => ({
  canAccessOrder: (...args: unknown[]) => canAccessOrder(...args),
  customerForbidden: () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
}));
vi.mock('@/lib/supabase/server', () => {
  /** Chainable query stub: select…maybeSingle for the lookup, update…eq for the write. */
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.eq = () => chain;
  chain.maybeSingle = () => maybeSingle();
  return {
    supabaseAdmin: {
      from: () => ({
        ...chain,
        update: (values: unknown) => {
          update(values);
          const done = { eq: () => done, then: (resolve: (v: unknown) => void) => resolve({ error: null }) };
          return done;
        },
      }),
    },
  };
});

import { PATCH } from '../route';

const PAYMENT_ID = '7f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f';

/** Calls PATCH with a JSON body. */
function patch(id: string, body: unknown) {
  const req = new NextRequest(`http://localhost/api/accounting/payment/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  return PATCH(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  canAccessOrder.mockReset().mockResolvedValue(true);
  maybeSingle.mockReset().mockResolvedValue({ data: { id: PAYMENT_ID, sale_order_id: 'o1', slip_url: null }, error: null });
  update.mockReset();
});

describe('PATCH /api/accounting/payment/[id]', () => {
  it('rejects a non-UUID id', async () => {
    expect((await patch('abc', { slip_url: 'https://drive.google.com/x' })).status).toBe(422);
  });

  it('rejects non-http links', async () => {
    const res = await patch(PAYMENT_ID, { slip_url: 'javascript:alert(1)' });
    expect(res.status).toBe(422);
    expect(update).not.toHaveBeenCalled();
  });

  it('saves a Drive link', async () => {
    const res = await patch(PAYMENT_ID, { slip_url: 'https://drive.google.com/file/d/abc/view' });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ slip_url: 'https://drive.google.com/file/d/abc/view', updated_by: 'u1' });
  });

  it('clears the link with an empty value', async () => {
    const res = await patch(PAYMENT_ID, { slip_url: '' });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({ slip_url: null, updated_by: 'u1' });
  });

  it('returns 404 for an unknown payment', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect((await patch(PAYMENT_ID, { slip_url: '' })).status).toBe(404);
  });

  it('respects the salesperson customer scope', async () => {
    canAccessOrder.mockResolvedValue(false);
    expect((await patch(PAYMENT_ID, { slip_url: '' })).status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it('does not overwrite a customer-uploaded slip', async () => {
    maybeSingle.mockResolvedValue({ data: { id: PAYMENT_ID, sale_order_id: 'o1', slip_url: 'payment-slips/c1/o1/a.jpg' }, error: null });
    const res = await patch(PAYMENT_ID, { slip_url: 'https://drive.google.com/x' });
    expect(res.status).toBe(422);
    expect(update).not.toHaveBeenCalled();
  });
});
