import { describe, expect, it } from 'vitest';
import { findDepotByFuzzyCode, hammingDistance } from '@/lib/ocr/depot-match';

const CARTEX_DEPOTS = ['KKAEN', 'LAMP', 'LLK', 'PICHIT', 'PSP', 'SPRC', 'SRB', 'SRC'].map((code) => ({ code }));

describe('hammingDistance', () => {
  it('counts differing characters for equal-length strings', () => {
    expect(hammingDistance('LLK', 'LLL')).toBe(1);
    expect(hammingDistance('SRB', 'SRB')).toBe(0);
    expect(hammingDistance('SRB', 'SPRC')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('findDepotByFuzzyCode', () => {
  it('maps a one-letter OCR misread to the only neighbouring depot', () => {
    expect(findDepotByFuzzyCode('LLL', CARTEX_DEPOTS)?.code).toBe('LLK');
    expect(findDepotByFuzzyCode('lamb', CARTEX_DEPOTS)?.code).toBe('LAMP');
  });

  it('refuses to guess when more than one depot is one edit away', () => {
    expect(findDepotByFuzzyCode('SRD', CARTEX_DEPOTS)).toBeUndefined();
  });

  it('does not steal a code that already matched exactly in the same batch', () => {
    expect(findDepotByFuzzyCode('SRX', CARTEX_DEPOTS, new Set(['SRB']))?.code).toBe('SRC');
    expect(findDepotByFuzzyCode('SRX', CARTEX_DEPOTS, new Set(['SRB', 'SRC']))).toBeUndefined();
  });

  it('ignores codes with a different length or shorter than 2 characters', () => {
    expect(findDepotByFuzzyCode('LL', CARTEX_DEPOTS)).toBeUndefined();
    expect(findDepotByFuzzyCode('L', CARTEX_DEPOTS)).toBeUndefined();
  });
});
