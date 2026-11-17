import { beforeEach, describe, expect, it, vi } from 'vitest';

const createDocumentLink = vi.fn();
const canAccessOrder = vi.fn();

vi.mock('@/lib/auth/api-guard', () => ({
  requireStaff: vi.fn(async () => ({ ctx: { userId: 'u1', role: 'SALES', companyId: 'c1', fullName: null, email: null } })),
}));
vi.mock('@/lib/supabase/server', () => ({ supabaseAdmin: {} }));
vi.mock('@/lib/services/customer-scope', () => ({
  canAccessOrder: (...args: unknown[]) => canAccessOrder(...args),
  customerForbidden: () => new Response(JSON.stringify({ error: 'forbidden' }), { status: 403 }),
  isScopedRole: (role: string) => role === 'SALES',
}));
vi.mock('@/lib/services/documents', () => ({
  DOCUMENT_TYPES: ['purchase-order', 'quotation', 'tax-invoice', 'delivery-note', 'receipt', 'delivery-record'],
  createDocumentLink: (...args: unknown[]) => createDocumentLink(...args),
}));
vi.mock('@/lib/services/payment-slip', () => ({
  resolveSiteOrigin: (origin: string) => origin,
}));

import { POST } from '../route';

const ORDER_ID = '7f1c2d3e-4b5a-4c6d-8e9f-0a1b2c3d4e5f';

/** Calls POST for a document. */
function post(type: string, body: unknown = {}) {
  const req = new Request(`https://app.example.com/api/documents/${type}/${ORDER_ID}/link`, { method: 'POST', body: JSON.stringify(body) });
  return POST(req, { params: Promise.resolve({ type, id: ORDER_ID }) });
}

beforeEach(() => {
  createDocumentLink.mockReset();
  canAccessOrder.mockReset().mockResolvedValue(true);
});

describe('POST /api/documents/[type]/[id]/link', () => {
  it('returns the same link builder result as the LINE send', async () => {
    createDocumentLink.mockResolvedValue({ doc: { docNo: 'QT-26110001' }, url: 'https://app.example.com/d/alQnrO3JgnI' });
    const res = await post('quotation', { vat_mode: 'incl' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, url: 'https://app.example.com/d/alQnrO3JgnI', docNo: 'QT-26110001' });
    expect(createDocumentLink).toHaveBeenCalledWith('c1', 'quotation', ORDER_ID, 'u1', { vatMode: 'incl', origin: 'https://app.example.com' });
  });

  it('rejects unknown document types', async () => {
    expect((await post('nope')).status).toBe(404);
    expect(createDocumentLink).not.toHaveBeenCalled();
  });

  it('respects the salesperson customer scope', async () => {
    canAccessOrder.mockResolvedValue(false);
    expect((await post('quotation')).status).toBe(403);
    expect(createDocumentLink).not.toHaveBeenCalled();
  });

  it('passes service errors through', async () => {
    createDocumentLink.mockResolvedValue({ error: 'ยังไม่ได้ออกใบเสนอราคาสำหรับใบสั่งขายนี้', status: 409 });
    const res = await post('quotation');
    expect(res.status).toBe(409);
  });
});
