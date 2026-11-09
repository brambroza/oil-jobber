import { VAT_MULTIPLIER } from '@/lib/services/order-pricing';
import type { VatMode } from '@/lib/documents/vat-mode';

/** Rounds to 4 decimals (precision of `sale_order_items.unit_price`). */
export function round4(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

/**
 * Converts a VAT-inclusive amount to what the form shows in `mode`.
 *
 * @param valueInclVat - amount or per-liter price including VAT
 * @param mode - `excl` shows the pre-VAT value, `incl` the value as is
 */
export function toDisplayPrice(valueInclVat: number, mode: VatMode): number {
  return mode === 'excl' ? valueInclVat / VAT_MULTIPLIER : valueInclVat;
}

/**
 * Converts a typed per-liter price back to the stored VAT-inclusive price.
 *
 * @param typed - price as typed in `mode`
 * @param mode - mode the price was typed in
 */
export function toUnitPriceInclVat(typed: number, mode: VatMode): number {
  return round4(mode === 'excl' ? typed * VAT_MULTIPLIER : typed);
}
