import { formatDate } from '@/lib/utils/date-format';

/** Price round fields needed for its label (dates `YYYY-MM-DD`, times are timestamps or `HH:mm`). */
export type PriceRoundLabelInput = {
  effective_date: string | null;
  effective_at: string | null;
  expires_date: string | null;
  expires_at: string | null;
  is_current?: boolean;
};

/**
 * `HH:mm` from a stored round time. `effective_at` / `expires_at` hold the
 * wall-clock time entered on the prices page (e.g. `2026-11-09T08:30:00+00:00`),
 * so the first `HH:mm` in the text is the time to show (same as the prices page).
 * @param value - timestamp or time text
 * @returns `HH:mm`, or '' when there is no time
 */
export function roundTime(value: string | null | undefined): string {
  const match = /(\d{2}):(\d{2})/.exec(String(value || ''));
  return match ? `${match[1]}:${match[2]}` : '';
}

/**
 * Label for a price round option in the order form.
 * - same day: `09/11/2026 08:30–17:00 น.`
 * - different days: `09/11/2026 08:30 น. – 10/11/2026 17:00 น.`
 * - no expiry: `09/11/2026 08:30 น.`
 * plus ` (ล่าสุด)` for the current round.
 * @param round - price round
 */
export function priceRoundLabel(round: PriceRoundLabelInput): string {
  const fromTime = roundTime(round.effective_at);
  const toTime = roundTime(round.expires_at);
  const fromDay = round.effective_date ? formatDate(round.effective_date) : '';
  const toDay = round.expires_date ? formatDate(round.expires_date) : '';
  const part = (day: string, time: string) => (time ? `${day} ${time} น.` : day);
  const suffix = round.is_current ? ' (ล่าสุด)' : '';

  if (!fromDay) return `${toDay ? `ถึง ${part(toDay, toTime)}` : '-'}${suffix}`;
  if (!toDay) return `${part(fromDay, fromTime)}${suffix}`;
  if (round.effective_date === round.expires_date) {
    if (fromTime && toTime) return `${fromDay} ${fromTime}–${toTime} น.${suffix}`;
    return `${part(fromDay, fromTime || toTime)}${suffix}`;
  }
  return `${part(fromDay, fromTime)} – ${part(toDay, toTime)}${suffix}`;
}
