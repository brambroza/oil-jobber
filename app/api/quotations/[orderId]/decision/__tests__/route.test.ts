import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const decideQuotation = vi.fn();
const canAccessOrder = vi.fn();

vi.mock('@/lib/auth/api-guard', () => ({
  requireStaff: vi.fn(async () => ({ ctx: { userId: 'u1', role: 'SALES', companyId: 'c1', fullName: null, email: null } })),
}));
vi.mock('@/lib/services/customer-scope', () => ({
  canAccessOrder: (...args: unknown[]) => canAccessOrder(...args),
  customerForbidden: () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
}));
vi.mock('@/lib/services/quotations', () => ({
  decideQuotation: (...args: unknown[]) => decideQuotation(...args),
}));

import { POST } from '../route';

const ORDER_ID = '7f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f';

/** Calls POST with a JSON body. */
function post(id: string, body: unknown) {
  const req = new NextRequest(`http://localhost/api/quotations/${id}/decision`, { method: 'POST', body: JSON.stringify(body) });
  return POST(req, { params: Promise.resolve({ orderId: id }) });
}

beforeEach(() => {
  decideQuotation.mockReset();
  canAccessOrder.mockReset().mockResolvedValue(true);
});

describe('POST /api/quotations/[orderId]/decision', () => {
  it('rejects a non-UUID id', async () => {
    expect((await post('abc', { action: 'convert' })).status).toBe(422);
    expect(decideQuotation).not.toHaveBeenCalled();
  });

  it('rejects quotations outside the salesperson scope', async () => {
    canAccessOrder.mockResolvedValue(false);
    expect((await post(ORDER_ID, { action: 'convert' })).status).toBe(403);
    expect(decideQuotation).not.toHaveBeenCalled();
  });

  it('rejects an unknown action', async () => {
    expect((await post(ORDER_ID, { action: 'approve' })).status).toBe(422);
    expect((await post(ORDER_ID, {})).status).toBe(422);
    expect(decideQuotation).not.toHaveBeenCalled();
  });

  it('passes the action and note to the service', async () => {
    decideQuotation.mockResolvedValue({ order_id: ORDER_ID, order_no: 'SO-1', order_status: 'SUBMITTED', quotation_no: 'QT-1' });
    const res = await post(ORDER_ID, { action: 'reject', note: ' แพงไป ' });
    expect(res.status).toBe(200);
    expect(decideQuotation).toHaveBeenCalledWith('c1', 'u1', ORDER_ID, 'reject', 'แพงไป');
    expect(await res.json()).toMatchObject({ ok: true, order_no: 'SO-1' });
  });

  it('returns the service error status', async () => {
    decideQuotation.mockResolvedValue({ error: 'หมดอายุ', status: 422 });
    const res = await post(ORDER_ID, { action: 'convert' });
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ error: 'หมดอายุ' });
  });
});
