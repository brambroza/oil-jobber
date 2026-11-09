/**
 * Default refinery / depot for a new order (staff form and customer LIFF).
 * Client-safe: pure logic over ids the APIs already return.
 *
 * Priority:
 * 1. the depot of the customer's latest order, when the customer may still
 *    use it (it is among the depots offered now)
 * 2. the only depot offered, when there is exactly one
 * 3. otherwise no depot; the refinery is still set when only one is offered
 */

export type DepotChoiceRef = { depot_id: string; refinery_id: string | null };

/**
 * Picks the default refinery and depot.
 *
 * @param input - depots the customer can order from now, refineries offered
 *   now, and the refinery/depot of the latest order (null when none)
 * @returns ids to preselect ('' = leave empty)
 */
export function pickDefaultDepot(input: {
  depots: DepotChoiceRef[];
  refineryIds: string[];
  lastOrder: { refinery_id: string | null; depot_id: string | null } | null | undefined;
}): { refinery_id: string; depot_id: string } {
  const depots = input.depots.filter((d) => d.depot_id);
  const lastDepotId = input.lastOrder?.depot_id || '';
  const last = lastDepotId ? depots.find((d) => d.depot_id === lastDepotId) : undefined;
  if (last) return { refinery_id: last.refinery_id || input.lastOrder?.refinery_id || '', depot_id: last.depot_id };

  const uniqueDepots = [...new Map(depots.map((d) => [d.depot_id, d])).values()];
  if (uniqueDepots.length === 1) return { refinery_id: uniqueDepots[0].refinery_id || '', depot_id: uniqueDepots[0].depot_id };

  const refineryIds = [...new Set(input.refineryIds.filter(Boolean))];
  if (refineryIds.length === 1) {
    const inRefinery = uniqueDepots.filter((d) => d.refinery_id === refineryIds[0]);
    return { refinery_id: refineryIds[0], depot_id: inRefinery.length === 1 ? inRefinery[0].depot_id : '' };
  }
  return { refinery_id: '', depot_id: '' };
}
