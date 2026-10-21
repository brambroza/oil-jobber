import { describe, expect, it } from 'vitest';
import { sourceLabel } from '@/lib/documents/format';

describe('sourceLabel', () => {
  it('puts the refinery before the depot', () => {
    expect(sourceLabel('ไทยออยล์', 'LLK', 'ลาดหลุมแก้ว')).toBe('ไทยออยล์ · LLK - ลาดหลุมแก้ว');
  });

  it('shows the depot code alone when it has no name', () => {
    expect(sourceLabel('ไทยออยล์', 'LLK', null)).toBe('ไทยออยล์ · LLK');
  });

  it('falls back to whichever side is known', () => {
    expect(sourceLabel(null, 'LLK', 'ลาดหลุมแก้ว')).toBe('LLK - ลาดหลุมแก้ว');
    expect(sourceLabel(' ไทยออยล์ ', null, null)).toBe('ไทยออยล์');
  });

  it('returns null when nothing is known', () => {
    expect(sourceLabel('', null, 'ลาดหลุมแก้ว')).toBeNull();
  });
});
