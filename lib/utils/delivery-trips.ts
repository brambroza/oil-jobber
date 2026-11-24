import { round2 } from '@/lib/services/order-pricing';
import { buildInvoiceContent, type InvoiceItemInput } from '@/lib/utils/invoice-content';
import type { DocumentItem, DocumentTotals } from '@/lib/documents/types';

/**
 * Delivery trips (เที่ยวส่งของ) and the tax invoice of one trip. Client-safe:
 * the trip dialog previews the invoice amount with the same maths the server
 * stores.
 */

/** Liters of one order item delivered on a trip (`sale_order_deliveries.lines`). */
export type TripLine = { sale_order_item_id: string; liters: number };

/** Active trip invoice of the same order, used for the last-trip remainder. */
export type OtherTripInvoice = { liters: number; net_incl_vat: number };

/** Tolerance for liter / baht comparisons (numeric(14,2) columns). */
const EPS = 0.005;

/**
 * Parses a stored `lines` jsonb value; drops malformed and zero lines.
 * @param raw - jsonb from `sale_order_deliveries.lines`
 */
export function parseTripLines(raw: unknown): TripLine[] {
  if (!Array.isArray(raw)) return [];
  const out: TripLine[] = [];
  for (const entry of raw) {
    const row = (entry ?? {}) as Record<string, unknown>;
    const id = String(row.sale_order_item_id ?? '');
    const liters = round2(Number(row.liters ?? 0));
    if (id && Number.isFinite(liters) && liters > 0) out.push({ sale_order_item_id: id, liters });
  }
  return out;
}

/**
 * Sum of liters per order item over the given trips.
 * @param trips - trips with their lines
 * @returns map `sale_order_item_id` → liters delivered
 */
export function deliveredByItem(trips: { lines: TripLine[] }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const trip of trips) {
    for (const line of trip.lines) map.set(line.sale_order_item_id, round2((map.get(line.sale_order_item_id) || 0) + line.liters));
  }
  return map;
}

/** Total liters of a set of trip lines. */
export function tripLiters(lines: TripLine[]): number {
  return round2(lines.reduce((sum, line) => sum + line.liters, 0));
}

/**
 * Checks a trip's liters against what is left on the order (all other trips
 * subtracted). Mirrors the check in the `save_order_delivery` RPC so the
 * dialog can show the error before saving.
 *
 * @param items - order items (`id`, `liters`, display name)
 * @param lines - liters of this trip
 * @param otherTrips - the order's other active trips
 * @returns Thai error message or null when valid
 */
export function validateTripLines(
  items: { id: string; liters: number; product_name: string }[],
  lines: TripLine[],
  otherTrips: { lines: TripLine[] }[],
): string | null {
  const done = deliveredByItem(otherTrips);
  let total = 0;
  for (const line of lines) {
    if (!Number.isFinite(line.liters) || line.liters < 0) return 'ลิตรต้องเป็นตัวเลขไม่ติดลบ';
    if (!line.liters) continue;
    const item = items.find((it) => it.id === line.sale_order_item_id);
    if (!item) return 'ไม่พบรายการสินค้าในใบสั่งขายนี้';
    const left = round2(item.liters - (done.get(item.id) || 0));
    if (line.liters > left + EPS) return `${item.product_name} ส่งได้ไม่เกิน ${left.toLocaleString('th-TH')} ลิตร (คงเหลือ)`;
    total += line.liters;
  }
  if (total <= 0) return 'ใส่ลิตรที่ส่งอย่างน้อย 1 รายการ';
  return null;
}

/**
 * Invoice lines of one trip: the order's printed lines (VAT-inclusive unit
 * price with the delivery fee folded in) at the liters of this trip.
 *
 * @param orderItems - printed order items with `item_id`
 * @param lines - liters of this trip
 */
export function tripInvoiceLines(orderItems: DocumentItem[], lines: TripLine[]): InvoiceItemInput[] {
  const byItem = new Map(lines.map((line) => [line.sale_order_item_id, line.liters]));
  return orderItems
    .filter((it) => it.item_id && (byItem.get(it.item_id) || 0) > 0)
    .map((it) => ({
      product_code: it.product_code,
      product_name: it.product_name,
      depot_label: it.depot_label,
      liters: byItem.get(it.item_id as string) as number,
      unit_price_incl_vat: it.unit_price_incl_vat,
    }));
}

/**
 * Content (lines + totals) of the tax invoice for one trip.
 *
 * The order's end-of-bill discount is spread by liters. The trip that brings
 * the invoiced liters up to the order's total takes the remainder instead, so
 * all trip invoices add up to the order total (down to the satang). If the
 * remainder would be a negative discount (rounding of the folded delivery fee
 * can push the lines a few satang under the order total), the discount is
 * clamped to 0 and the invoices may differ from the order by those satang.
 *
 * @param order - printed order items and totals (`loadOrderDocumentData`)
 * @param lines - liters of this trip
 * @param others - the order's other active trip invoices
 */
export function buildTripInvoiceContent(
  order: { items: DocumentItem[]; totals: Pick<DocumentTotals, 'total_liters' | 'discount_incl_vat' | 'net_incl_vat'> },
  lines: TripLine[],
  others: OtherTripInvoice[],
): { items: DocumentItem[]; totals: DocumentTotals; completes_order: boolean } {
  const invoiceLines = tripInvoiceLines(order.items, lines);
  const liters = round2(invoiceLines.reduce((sum, it) => sum + it.liters, 0));
  const gross = round2(invoiceLines.reduce((sum, it) => sum + round2(it.liters * it.unit_price_incl_vat), 0));
  const othersLiters = round2(others.reduce((sum, o) => sum + o.liters, 0));
  const othersNet = round2(others.reduce((sum, o) => sum + o.net_incl_vat, 0));
  const orderLiters = Number(order.totals.total_liters || 0);
  const completes = orderLiters > 0 && othersLiters + liters >= orderLiters - EPS;

  let discount: number;
  if (completes) {
    discount = Math.max(0, round2(gross - round2(order.totals.net_incl_vat - othersNet)));
  } else {
    discount = orderLiters > 0 ? round2(Number(order.totals.discount_incl_vat || 0) * liters / orderLiters) : 0;
  }
  const built = buildInvoiceContent(invoiceLines, discount);
  return { ...built, completes_order: completes };
}

/**
 * Re-points trip lines after the order's items were re-created (the order
 * form replaces `sale_order_items` rows on save). Items are matched by
 * product code in their order; a product with deliveries must keep the same
 * number of lines and enough liters.
 *
 * @param oldItems - previous items (id, product_code, display name), in display order
 * @param newItems - new items (id, product_code, liters), in display order
 * @param trips - trips with their lines
 * @returns remapped lines per trip, or a Thai error when the edit would drop delivered liters
 */
export function remapTripLines<T extends { lines: TripLine[] }>(
  oldItems: { id: string; product_code: string; product_name: string }[],
  newItems: { id: string; product_code: string; liters: number }[],
  trips: T[],
): { trips: (T & { lines: TripLine[] })[] } | { error: string } {
  const delivered = deliveredByItem(trips);
  const mapping = new Map<string, string>();
  const byCode = (list: { product_code: string }[], code: string) => list.filter((it) => it.product_code === code);
  for (const old of oldItems) {
    if (mapping.has(old.id)) continue;
    const oldSame = byCode(oldItems, old.product_code) as typeof oldItems;
    const newSame = byCode(newItems, old.product_code) as typeof newItems;
    const hasDelivery = oldSame.some((it) => (delivered.get(it.id) || 0) > 0);
    if (!hasDelivery) continue;
    if (oldSame.length !== newSame.length) {
      return { error: `${old.product_name} มีการบันทึกส่งของแล้ว ห้ามเพิ่มหรือลบบรรทัดของสินค้านี้ (ลบเที่ยวส่งก่อนจึงแก้ได้)` };
    }
    for (let index = 0; index < oldSame.length; index += 1) {
      const it = oldSame[index];
      const target = newSame[index];
      const done = delivered.get(it.id) || 0;
      if (target.liters + EPS < done) {
        return { error: `${it.product_name} ส่งไปแล้ว ${done.toLocaleString('th-TH')} ลิตร แก้ให้น้อยกว่านี้ไม่ได้` };
      }
      mapping.set(it.id, target.id);
    }
  }
  return {
    trips: trips.map((trip) => ({
      ...trip,
      lines: trip.lines.map((line) => ({ ...line, sale_order_item_id: mapping.get(line.sale_order_item_id) ?? line.sale_order_item_id })),
    })),
  };
}
