import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildDocumentShortUrl, isPlausibleShortCode, SHORT_CODE_BYTES } from '../short-link';

describe('document short link', () => {
  it('builds the short URL', () => {
    expect(buildDocumentShortUrl('https://a.com/', 'Ab3xK9pQ2mZ')).toBe('https://a.com/d/Ab3xK9pQ2mZ');
  });

  it('generated codes pass the shape check', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isPlausibleShortCode(randomBytes(SHORT_CODE_BYTES).toString('base64url'))).toBe(true);
    }
  });

  it('rejects malformed codes', () => {
    expect(isPlausibleShortCode('')).toBe(false);
    expect(isPlausibleShortCode('abc')).toBe(false);
    expect(isPlausibleShortCode('A'.repeat(12))).toBe(false);
    expect(isPlausibleShortCode('../etc/pass')).toBe(false);
  });
});
