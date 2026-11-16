import { describe, expect, it } from 'vitest';
import {
  buildPaymentLinkUrl,
  defaultApproveAmount,
  isPlausibleLinkToken,
  paymentLinkExpiry,
  resolvePaymentLinkState,
  SLIP_MAX_BYTES,
  slipExtension,
  sniffSlipMime,
  validateSlipFile,
} from '@/lib/utils/payment-slip';

const now = new Date('2026-11-16T10:00:00Z');
const base = { expiresAt: '2026-11-20T00:00:00Z', revokedAt: null, outstanding: 1000, orderStatus: 'WAITING_PAYMENT', now };

describe('paymentLinkExpiry', () => {
  it('adds 7 days by default', () => {
    expect(paymentLinkExpiry(now).toISOString()).toBe('2026-11-23T10:00:00.000Z');
  });
  it('accepts a custom lifetime', () => {
    expect(paymentLinkExpiry(now, 1).toISOString()).toBe('2026-11-17T10:00:00.000Z');
  });
});

describe('resolvePaymentLinkState', () => {
  it('is active with balance before expiry', () => {
    expect(resolvePaymentLinkState(base)).toBe('ACTIVE');
  });
  it('expires at the exact expiry time', () => {
    expect(resolvePaymentLinkState({ ...base, expiresAt: now })).toBe('EXPIRED');
  });
  it('is paid when nothing is outstanding', () => {
    expect(resolvePaymentLinkState({ ...base, outstanding: 0 })).toBe('PAID');
    expect(resolvePaymentLinkState({ ...base, outstanding: 0.004 })).toBe('PAID');
  });
  it('paid wins over expired', () => {
    expect(resolvePaymentLinkState({ ...base, outstanding: 0, expiresAt: '2026-01-01' })).toBe('PAID');
  });
  it('revoked wins over everything', () => {
    expect(resolvePaymentLinkState({ ...base, revokedAt: '2026-11-15', outstanding: 0 })).toBe('REVOKED');
  });
  it('is closed for cancelled, draft or missing orders', () => {
    expect(resolvePaymentLinkState({ ...base, orderStatus: 'CANCELLED' })).toBe('CLOSED');
    expect(resolvePaymentLinkState({ ...base, orderStatus: 'DRAFT' })).toBe('CLOSED');
    expect(resolvePaymentLinkState({ ...base, orderStatus: null })).toBe('CLOSED');
  });
});

describe('validateSlipFile', () => {
  it('accepts images and pdf within the limit', () => {
    expect(validateSlipFile('image/jpeg', 1000)).toBeNull();
    expect(validateSlipFile('application/pdf', SLIP_MAX_BYTES)).toBeNull();
  });
  it('rejects other types', () => {
    expect(validateSlipFile('image/heic', 1000)).toMatch(/รองรับเฉพาะ/);
    expect(validateSlipFile('text/html', 1000)).toMatch(/รองรับเฉพาะ/);
  });
  it('rejects empty and oversized files', () => {
    expect(validateSlipFile('image/png', 0)).toMatch(/ว่างเปล่า/);
    expect(validateSlipFile('image/png', SLIP_MAX_BYTES + 1)).toMatch(/5 MB/);
  });
});

describe('slipExtension', () => {
  it('maps mime to extension', () => {
    expect(slipExtension('application/pdf')).toBe('pdf');
    expect(slipExtension('image/png')).toBe('png');
    expect(slipExtension('image/webp')).toBe('webp');
    expect(slipExtension('image/jpeg')).toBe('jpg');
  });
});

describe('defaultApproveAmount', () => {
  it('caps at outstanding', () => {
    expect(defaultApproveAmount(5000, 1200.5)).toBe(1200.5);
  });
  it('keeps smaller customer amount', () => {
    expect(defaultApproveAmount(300.456, 1000)).toBe(300.46);
  });
  it('never goes negative', () => {
    expect(defaultApproveAmount(100, -5)).toBe(0);
  });
});

describe('link url + token', () => {
  it('joins origin and token', () => {
    expect(buildPaymentLinkUrl('https://a.com/', 'abc')).toBe('https://a.com/pay/abc');
  });
  it('checks token shape', () => {
    expect(isPlausibleLinkToken('A'.repeat(32))).toBe(true);
    expect(isPlausibleLinkToken('abc')).toBe(false);
    expect(isPlausibleLinkToken('../'.padEnd(32, 'a'))).toBe(false);
  });
});

describe('sniffSlipMime', () => {
  const bytes = (...values: number[]) => new Uint8Array(values);
  const text = (value: string) => new TextEncoder().encode(value);
  it('detects jpeg, png, webp and pdf', () => {
    expect(sniffSlipMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
    expect(sniffSlipMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('image/png');
    expect(sniffSlipMime(text('RIFF\u0000\u0000\u0000\u0000WEBPVP8 '))).toBe('image/webp');
    expect(sniffSlipMime(text('%PDF-1.7'))).toBe('application/pdf');
  });
  it('rejects html or truncated input', () => {
    expect(sniffSlipMime(text('<html><script>'))).toBeNull();
    expect(sniffSlipMime(bytes(0xff, 0xd8))).toBeNull();
    expect(sniffSlipMime(bytes())).toBeNull();
  });
});
