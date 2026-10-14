import { describe, expect, it } from 'vitest';
import { phoneTh } from '@/lib/documents/format';

describe('phoneTh', () => {
  it('joins label and number with a non-breaking space', () => {
    expect(phoneTh('081-234-5678')).toBe('โทร 081-234-5678');
  });

  it('turns spaces inside the number into non-breaking spaces', () => {
    expect(phoneTh(' 02 123  4567 ')).toBe('โทร 02 123 4567');
  });

  it('omits the label when empty', () => {
    expect(phoneTh('081 234 5678', '')).toBe('081 234 5678');
  });
});
