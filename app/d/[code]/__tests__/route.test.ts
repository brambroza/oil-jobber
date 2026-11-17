import { beforeEach, describe, expect, it, vi } from 'vitest';

const resolveDocumentShortLink = vi.fn();
vi.mock('@/lib/services/short-links', () => ({
  resolveDocumentShortLink: (...args: unknown[]) => resolveDocumentShortLink(...args),
}));

import { GET } from '../route';

/** Calls GET for a code. */
function get(code: string) {
  return GET(new Request(`http://localhost/d/${code}`), { params: Promise.resolve({ code }) });
}

beforeEach(() => {
  resolveDocumentShortLink.mockReset();
});

describe('GET /d/[code]', () => {
  it('redirects to the stored PDF', async () => {
    resolveDocumentShortLink.mockResolvedValue('https://x.supabase.co/storage/v1/object/public/documents/c/quotation/o/1-QT.pdf');
    const res = await get('Ab3xK9pQ2mZ');
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('https://x.supabase.co/storage/v1/object/public/documents/c/quotation/o/1-QT.pdf');
    expect(resolveDocumentShortLink).toHaveBeenCalledWith('Ab3xK9pQ2mZ');
  });

  it('returns 404 for an unknown code', async () => {
    resolveDocumentShortLink.mockResolvedValue(null);
    const res = await get('zzzzzzzzzzz');
    expect(res.status).toBe(404);
  });
});
