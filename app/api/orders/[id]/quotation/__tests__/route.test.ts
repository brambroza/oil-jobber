import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const issueQuotation = vi.fn();
const loadActiveQuotation = vi.fn();
const canAccessOrder = vi.fn();

vi.mock('@/lib/auth/api-guard', () => ({
  requireStaff: vi.fn(async () => ({ ctx: { userId: 'u1', role: 'SALES', companyId: 'c1', fullName: null, email: null } })),
}));
vi.mock('@/lib/services/customer-scope', () => ({
  canAccessOrder: (...args: unknown[]) => canAccessOrder(...args),
  customerForbidden: () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
}));
vi.mock('@/lib/services/quotations', () => ({
  issueQuotation: (...args: unknown[]) => issueQuotation(...args),
  loadActiveQuotation: (...args: unknown[]) => loadActiveQuotation(...args),
}));

import { GET, POST } from '../route';

const ORDER_ID = '7f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f';

/** Calls POST with a JSON body. */
function post(id: string, body: unknown) {
  const req = new NextRequest(`http://localhost/api/orders/${id}/quotation`, { method: 'POST', body: JSON.stringify(body) });
  return POST(req, { params: Promise.resolve({ id }) });
}

beforeEach(() => {
  issueQuotation.mockReset();
  loadActiveQuotation.mockReset();
  canAccessOrder.mockReset().mockResolvedValue(true);
});

describe('POST /api/orders/[id]/quotation', () => {
  it('rejects a non-UUID order id', async () => {
    const res = await post('abc', {});
    expect(res.status).toBe(422);
    expect(issueQuotation).not.toHaveBeenCalled();
  });

  it('rejects orders outside the salesperson scope', async () => {
    canAccessOrder.mockResolvedValue(false);
    const res = await post(ORDER_ID, {});
    expect(res.status).toBe(403);
  });

  it('rejects an invalid validity date', async () => {
    const res = await post(ORDER_ID, { valid_until: '14/10/2026' });
    expect(res.status).toBe(422);
  });

  it('issues with defaults (empty date → null, reissue false)', async () => {
    issueQuotation.mockResolvedValue({ quotation: { quotation_no: 'QT-2610140001' } });
    const res = await post(ORDER_ID, { valid_until: '', note: '' });
    expect(res.status).toBe(200);
    expect(issueQuotation).toHaveBeenCalledWith('c1', 'u1', ORDER_ID, { valid_until: null, note: null, reissue: false });
    expect(await res.json()).toEqual({ quotation: { quotation_no: 'QT-2610140001' } });
  });

  it('returns 409 with the existing quotation', async () => {
    issueQuotation.mockResolvedValue({ error: 'มีอยู่แล้ว', status: 409, quotation: { quotation_no: 'QT-2610130002' } });
    const res = await post(ORDER_ID, { reissue: false });
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ quotation: { quotation_no: 'QT-2610130002' } });
  });
});

describe('GET /api/orders/[id]/quotation', () => {
  it('returns the active quotation', async () => {
    loadActiveQuotation.mockResolvedValue({ quotation: null });
    const req = new NextRequest(`http://localhost/api/orders/${ORDER_ID}/quotation`);
    const res = await GET(req, { params: Promise.resolve({ id: ORDER_ID }) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ quotation: null });
  });
});
