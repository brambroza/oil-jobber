import { describe, expect, it } from 'vitest';
import { calculateCreditUsage, groupLineAccountsByCustomer } from '@/lib/utils/customer-list';

const row = (id: string, customer_id: string | null, group_id: string | null = null) => ({
  id,
  customer_id,
  group_id,
  display_name: `name-${id}`,
  profile_image_url: null,
});

describe('groupLineAccountsByCustomer', () => {
  it('groups accounts per customer and skips unlinked rows', () => {
    const map = groupLineAccountsByCustomer([row('a', 'c1'), row('b', 'c2'), row('c', 'c1'), row('d', null)]);
    expect(map.get('c1')?.map((x) => x.id)).toEqual(['a', 'c']);
    expect(map.get('c2')?.map((x) => x.id)).toEqual(['b']);
    expect(map.size).toBe(2);
  });

  it('keeps the first row of a repeated LINE group', () => {
    const map = groupLineAccountsByCustomer([row('new', 'c1', 'G1'), row('old', 'c1', 'G1'), row('other', 'c1', 'G2')]);
    expect(map.get('c1')?.map((x) => x.id)).toEqual(['new', 'other']);
  });

  it('keeps one group linked to two customers on both', () => {
    const map = groupLineAccountsByCustomer([row('a', 'c1', 'G1'), row('b', 'c2', 'G1')]);
    expect(map.get('c1')).toHaveLength(1);
    expect(map.get('c2')).toHaveLength(1);
  });

  it('flags groups and does not expose LINE ids', () => {
    const [account] = groupLineAccountsByCustomer([row('a', 'c1', 'G1')]).get('c1') ?? [];
    expect(account).toEqual({ id: 'a', display_name: 'name-a', profile_image_url: null, is_group: true });
  });
});

describe('calculateCreditUsage', () => {
  it('computes remaining credit and usage', () => {
    expect(calculateCreditUsage(1000, 250)).toEqual({ remaining: 750, percentUsed: 25 });
  });

  it('keeps a negative remainder but caps usage when over limit', () => {
    expect(calculateCreditUsage(1000, 1500)).toEqual({ remaining: -500, percentUsed: 100 });
  });

  it('handles a zero limit', () => {
    expect(calculateCreditUsage(0, 0)).toEqual({ remaining: 0, percentUsed: 0 });
    expect(calculateCreditUsage(0, 100)).toEqual({ remaining: -100, percentUsed: 100 });
  });
});
