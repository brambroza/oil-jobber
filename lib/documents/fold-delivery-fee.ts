import { round2, VAT_MULTIPLIER } from '@/lib/services/order-pricing';
import type { DocumentItem } from '@/lib/documents/types';

/**
 * Spreads the order's delivery fee into every item's unit price so printed
 * documents show one price per liter and no separate delivery line. The
 * drawer and the stored order keep the fee separate; only the document view
 * changes. Rounding leftovers go to the last item so the line amounts still
 * add up to goods + delivery fee exactly.
 *
 * @param items - items with VAT-inclusive prices from the order
 * @param feeInclVat - total delivery fee on the order (incl. VAT)
 * @param feePerLiterInclVat - delivery fee per liter (incl. VAT)
 */
export function foldDeliveryFeeIntoItems(items: DocumentItem[], feeInclVat: number, feePerLiterInclVat: number): DocumentItem[] {
  if (!(feeInclVat > 0) || !items.length) return items;
  const folded = items.map((it) => {
    const unitIncl = round2(it.unit_price_incl_vat + feePerLiterInclVat);
    const amountIncl = round2(it.liters * unitIncl);
    return {
      ...it,
      unit_price_incl_vat: unitIncl,
      unit_price_ex_vat: Number((unitIncl / VAT_MULTIPLIER).toFixed(4)),
      amount_incl_vat: amountIncl,
      amount_ex_vat: round2(amountIncl / VAT_MULTIPLIER),
    };
  });
  const target = round2(items.reduce((s, it) => s + it.amount_incl_vat, 0) + feeInclVat);
  const sum = round2(folded.reduce((s, it) => s + it.amount_incl_vat, 0));
  const diff = round2(target - sum);
  if (diff !== 0) {
    const last = folded[folded.length - 1];
    last.amount_incl_vat = round2(last.amount_incl_vat + diff);
    last.amount_ex_vat = round2(last.amount_incl_vat / VAT_MULTIPLIER);
  }
  return folded;
}
