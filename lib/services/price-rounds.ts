/** Confirmed oil_base_prices row as used when picking price rounds for an order. */
export type PriceRoundRow = {
  id: string;
  refinery_id: string | null;
  effective_date: string | null;
  effective_at: string | null;
  expires_date: string | null;
  expires_at: string | null;
};

/** Price round option shown to admins in the order form. */
export type PriceRoundOption = PriceRoundRow & { is_current: boolean };

/** Max price rounds per refinery returned to the admin round picker. */
export const MAX_ROUNDS_PER_REFINERY = 30;

/**
 * Normalizes a time string to `HH:mm:ss`, falling back when empty/invalid.
 *
 * @param value - raw time text (e.g. `08:30` or `08:30:15`)
 * @param fallback - time used when the value is missing or unparseable
 * @returns normalized time
 */
export function normalizeTime(value: string | null | undefined, fallback: '00:00:00' | '23:59:59'): string {
  const text = String(value || '').trim();
  if (!text) return fallback;
  const match = text.match(/(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return fallback;
  return `${match[1]}:${match[2]}:${match[3] || '00'}`;
}

/**
 * True when the round is in effect at the given Bangkok date/time.
 *
 * @param round - price round
 * @param nowDate - `YYYY-MM-DD` in Asia/Bangkok
 * @param nowTime - `HH:mm:ss` in Asia/Bangkok
 */
export function isRoundActive(round: PriceRoundRow, nowDate: string, nowTime: string): boolean {
  const effectiveDate = String(round.effective_date || '').trim();
  if (!effectiveDate) return false;
  const effectiveTime = normalizeTime(round.effective_at, '00:00:00');
  const expiresDate = String(round.expires_date || '').trim();
  const expiresTime = normalizeTime(round.expires_at, '23:59:59');
  if (effectiveDate > nowDate || (effectiveDate === nowDate && effectiveTime > nowTime)) return false;
  if (expiresDate && (expiresDate < nowDate || (expiresDate === nowDate && expiresTime <= nowTime))) return false;
  return true;
}

/**
 * Picks one price round per refinery for pricing an order: the latest active
 * round by default, or the explicitly chosen round (admin override) for its
 * refinery regardless of effective/expiry window.
 *
 * @param rounds - confirmed rounds sorted newest first
 * @param allowedRefineryIds - customer's allowed refineries (empty = all)
 * @param nowDate - `YYYY-MM-DD` in Asia/Bangkok
 * @param nowTime - `HH:mm:ss` in Asia/Bangkok
 * @param overrideRoundId - round chosen by an admin, if any
 * @returns chosen rounds plus the list of round options for the picker
 */
export function selectPriceRounds(
  rounds: PriceRoundRow[],
  allowedRefineryIds: string[],
  nowDate: string,
  nowTime: string,
  overrideRoundId?: string | null,
): { selected: PriceRoundRow[]; options: PriceRoundOption[]; overrideFound: boolean } {
  const currentByRefinery = new Map<string, PriceRoundRow>();
  const eligible: PriceRoundRow[] = [];

  for (const round of rounds) {
    const refineryId = String(round.refinery_id || '');
    if (!refineryId || !String(round.effective_date || '').trim()) continue;
    if (allowedRefineryIds.length && !allowedRefineryIds.includes(refineryId)) continue;
    eligible.push(round);
    if (!currentByRefinery.has(refineryId) && isRoundActive(round, nowDate, nowTime)) {
      currentByRefinery.set(refineryId, round);
    }
  }

  const currentIds = new Set([...currentByRefinery.values()].map((round) => String(round.id)));
  const countByRefinery = new Map<string, number>();
  const options: PriceRoundOption[] = [];
  for (const round of eligible) {
    const refineryId = String(round.refinery_id);
    const count = countByRefinery.get(refineryId) ?? 0;
    if (count >= MAX_ROUNDS_PER_REFINERY && !currentIds.has(String(round.id))) continue;
    countByRefinery.set(refineryId, count + 1);
    options.push({ ...round, is_current: currentIds.has(String(round.id)) });
  }

  const selectedByRefinery = new Map(currentByRefinery);
  let overrideFound = false;
  if (overrideRoundId) {
    const override = eligible.find((round) => String(round.id) === overrideRoundId);
    if (override) {
      selectedByRefinery.set(String(override.refinery_id), override);
      overrideFound = true;
    }
  }

  return { selected: [...selectedByRefinery.values()], options, overrideFound };
}
