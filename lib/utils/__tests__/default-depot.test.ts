import { describe, expect, it } from 'vitest';
import { pickDefaultDepot } from '@/lib/utils/default-depot';

const depotA1 = { depot_id: 'a1', refinery_id: 'A' };
const depotA2 = { depot_id: 'a2', refinery_id: 'A' };
const depotB1 = { depot_id: 'b1', refinery_id: 'B' };

describe('pickDefaultDepot', () => {
  it('uses the latest order depot when it is still allowed', () => {
    expect(pickDefaultDepot({ depots: [depotA1, depotA2, depotB1], refineryIds: ['A', 'B'], lastOrder: { refinery_id: 'B', depot_id: 'b1' } }))
      .toEqual({ refinery_id: 'B', depot_id: 'b1' });
  });

  it('ignores a latest order depot the customer can no longer use', () => {
    expect(pickDefaultDepot({ depots: [depotA1, depotA2], refineryIds: ['A'], lastOrder: { refinery_id: 'B', depot_id: 'b1' } }))
      .toEqual({ refinery_id: 'A', depot_id: '' });
  });

  it('selects the only depot', () => {
    expect(pickDefaultDepot({ depots: [depotB1, depotB1], refineryIds: ['B'], lastOrder: null }))
      .toEqual({ refinery_id: 'B', depot_id: 'b1' });
  });

  it('selects only the refinery when it has several depots', () => {
    expect(pickDefaultDepot({ depots: [depotA1, depotA2], refineryIds: ['A'], lastOrder: null }))
      .toEqual({ refinery_id: 'A', depot_id: '' });
  });

  it('selects the single depot of the only refinery even when other refineries have none listed', () => {
    expect(pickDefaultDepot({ depots: [depotA1], refineryIds: ['A', 'A'], lastOrder: undefined }))
      .toEqual({ refinery_id: 'A', depot_id: 'a1' });
  });

  it('leaves everything empty when there are several choices and no history', () => {
    expect(pickDefaultDepot({ depots: [depotA1, depotB1], refineryIds: ['A', 'B'], lastOrder: null }))
      .toEqual({ refinery_id: '', depot_id: '' });
    expect(pickDefaultDepot({ depots: [], refineryIds: [], lastOrder: null })).toEqual({ refinery_id: '', depot_id: '' });
  });
});
