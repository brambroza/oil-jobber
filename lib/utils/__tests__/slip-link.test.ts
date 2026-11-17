import { describe, expect, it } from 'vitest';
import { classifySlipUrl, isHttpUrl } from '../slip-link';

describe('isHttpUrl', () => {
  it('accepts http(s) links', () => {
    expect(isHttpUrl('https://drive.google.com/file/d/abc/view')).toBe(true);
    expect(isHttpUrl(' http://example.com/slip.jpg ')).toBe(true);
  });
  it('rejects other schemes and junk', () => {
    expect(isHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpUrl('data:text/html,hi')).toBe(false);
    expect(isHttpUrl('drive.google.com/abc')).toBe(false);
    expect(isHttpUrl('')).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
  });
});

describe('classifySlipUrl', () => {
  it('detects customer-uploaded slips', () => {
    expect(classifySlipUrl('payment-slips/c1/o1/1-a.jpg')).toEqual({ kind: 'stored', path: 'c1/o1/1-a.jpg' });
  });
  it('detects external links', () => {
    expect(classifySlipUrl('https://drive.google.com/x')).toEqual({ kind: 'external', url: 'https://drive.google.com/x' });
  });
  it('ignores empty or unsafe values', () => {
    expect(classifySlipUrl(null)).toEqual({ kind: 'none' });
    expect(classifySlipUrl('javascript:alert(1)')).toEqual({ kind: 'none' });
  });
});
