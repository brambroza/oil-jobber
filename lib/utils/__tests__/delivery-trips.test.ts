import { describe, expect, it } from 'vitest';
import {
  buildTripInvoiceContent, deliveredByItem, parseTripLines, remapTripLines, tripInvoiceLines, tripLiters, validateTripLines,
} from '@/lib/utils/delivery-trips';
import type { DocumentItem } from '@/lib/documents/types';

/** Printed order item with the delivery fee already folded into the unit price. */
function item(id: string, code: string, liters: number, unit: number): DocumentItem {
  return {
    no: 1, item_id: id, product_code: code, product_name: code, depot_label: null, liters,
    unit_price_incl_vat: unit, unit_price_ex_vat: 0, amount_incl_vat: Math.round(liters * unit * 100) / 100, amount_ex_vat: 0,
  };
}

const items = [item('a', 'B7', 30000, 31.2), item('b', 'G95', 5000, 38.5)];
// gross 936,000 + 192,500 = 1,128,500 ; discount 2,000 ; net 1,126,500
const order = { items, totals: { total_liters: 35000, discount_incl_vat: 2000, net_incl_vat: 1126500 } };

describe('parseTripLines', () => {
  it('keeps valid positive lines only', () => {
    expect(parseTripLines([{ sale_order_item_id: 'a', liters: '100.005' }, { sale_order_item_id: 'b', liters: 0 }, null, { liters: 5 }]))
      .toEqual([{ sale_order_item_id: 'a', liters: 100.01 }]);
    expect(parseTripLines('x')).toEqual([]);
  });
});

describe('deliveredByItem / tripLiters', () => {
  it('sums liters per item across trips', () => {
    const map = deliveredByItem([{ lines: [{ sale_order_item_id: 'a', liters: 100 }] }, { lines: [{ sale_order_item_id: 'a', liters: 50.5 }, { sale_order_item_id: 'b', liters: 10 }] }]);
    expect(map.get('a')).toBe(150.5);
    expect(map.get('b')).toBe(10);
    expect(tripLiters([{ sale_order_item_id: 'a', liters: 1.1 }, { sale_order_item_id: 'b', liters: 2.2 }])).toBe(3.3);
  });
});

describe('validateTripLines', () => {
  const orderItems = [{ id: 'a', liters: 30000, product_name: 'ดีเซล' }];
  const others = [{ lines: [{ sale_order_item_id: 'a', liters: 18000 }] }];
  it('accepts liters up to what is left', () => {
    expect(validateTripLines(orderItems, [{ sale_order_item_id: 'a', liters: 12000 }], others)).toBeNull();
  });
  it('rejects liters over the remainder, zero trips and unknown items', () => {
    expect(validateTripLines(orderItems, [{ sale_order_item_id: 'a', liters: 12001 }], others)).toContain('ไม่เกิน');
    expect(validateTripLines(orderItems, [{ sale_order_item_id: 'a', liters: 0 }], others)).toContain('อย่างน้อย');
    expect(validateTripLines(orderItems, [{ sale_order_item_id: 'x', liters: 1 }], others)).toContain('ไม่พบ');
    expect(validateTripLines(orderItems, [{ sale_order_item_id: 'a', liters: -1 }], others)).toContain('ไม่ติดลบ');
  });
});

describe('tripInvoiceLines', () => {
  it('prices only the delivered items at the order unit price', () => {
    expect(tripInvoiceLines(items, [{ sale_order_item_id: 'b', liters: 1000 }]))
      .toEqual([{ product_code: 'G95', product_name: 'G95', depot_label: null, liters: 1000, unit_price_incl_vat: 38.5 }]);
  });
});

describe('buildTripInvoiceContent', () => {
  it('spreads the discount by liters on a partial trip', () => {
    const res = buildTripInvoiceContent(order, [{ sale_order_item_id: 'a', liters: 17500 }], []);
    expect(res.completes_order).toBe(false);
    expect(res.totals.gross_before_discount).toBe(546000);
    expect(res.totals.discount_incl_vat).toBe(1000);
    expect(res.totals.net_incl_vat).toBe(545000);
    expect(res.totals.total_liters).toBe(17500);
  });

  it('makes the last trip take the remainder so all trips add up to the order', () => {
    const first = buildTripInvoiceContent(order, [{ sale_order_item_id: 'a', liters: 10000 }], []);
    const second = buildTripInvoiceContent(order, [{ sale_order_item_id: 'a', liters: 10000 }, { sale_order_item_id: 'b', liters: 1234 }],
      [{ liters: 10000, net_incl_vat: first.totals.net_incl_vat }]);
    const others = [first, second].map((r) => ({ liters: r.totals.total_liters, net_incl_vat: r.totals.net_incl_vat }));
    const last = buildTripInvoiceContent(order, [{ sale_order_item_id: 'a', liters: 10000 }, { sale_order_item_id: 'b', liters: 3766 }], others);
    expect(last.completes_order).toBe(true);
    const sum = Math.round((first.totals.net_incl_vat + second.totals.net_incl_vat + last.totals.net_incl_vat) * 100) / 100;
    expect(sum).toBe(1126500);
  });

  it('a single trip for the whole order equals the order total', () => {
    const res = buildTripInvoiceContent(order, [{ sale_order_item_id: 'a', liters: 30000 }, { sale_order_item_id: 'b', liters: 5000 }], []);
    expect(res.completes_order).toBe(true);
    expect(res.totals.net_incl_vat).toBe(1126500);
    expect(res.totals.discount_incl_vat).toBe(2000);
  });

  it('clamps a negative remainder discount to 0', () => {
    const res = buildTripInvoiceContent({ items: [item('a', 'B7', 3, 10.01)], totals: { total_liters: 3, discount_incl_vat: 0, net_incl_vat: 30.04 } },
      [{ sale_order_item_id: 'a', liters: 3 }], []);
    expect(res.totals.discount_incl_vat).toBe(0);
    expect(res.totals.net_incl_vat).toBe(30.03);
  });
});

describe('remapTripLines', () => {
  const oldItems = [{ id: 'a', product_code: 'B7', product_name: 'ดีเซล' }, { id: 'b', product_code: 'G95', product_name: 'เบนซิน' }];
  const trips = [{ id: 't1', lines: [{ sale_order_item_id: 'a', liters: 1000 }] }];

  it('maps delivered lines to the re-created items by product code', () => {
    const res = remapTripLines(oldItems, [{ id: 'x', product_code: 'G95', liters: 10 }, { id: 'y', product_code: 'B7', liters: 1500 }], trips);
    expect(res).toEqual({ trips: [{ id: 't1', lines: [{ sale_order_item_id: 'y', liters: 1000 }] }] });
  });

  it('rejects dropping a delivered product or going under the delivered liters', () => {
    expect(remapTripLines(oldItems, [{ id: 'x', product_code: 'G95', liters: 10 }], trips)).toHaveProperty('error');
    expect(remapTripLines(oldItems, [{ id: 'y', product_code: 'B7', liters: 999 }], trips)).toHaveProperty('error');
  });

  it('ignores products without deliveries', () => {
    const res = remapTripLines(oldItems, [{ id: 'y', product_code: 'B7', liters: 1000 }], trips);
    expect('trips' in res).toBe(true);
  });
});
