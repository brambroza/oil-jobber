import { describe, expect, it } from 'vitest';
import { applyInvoiceContent, buildInvoiceContent, invoiceItemsFromSnapshot } from '@/lib/utils/invoice-content';
import type { OrderDocumentData } from '@/lib/documents/types';

const line = { product_code: 'B7', product_name: 'ดีเซล B7', depot_label: 'LLK', liters: 1000, unit_price_incl_vat: 32.1 };

describe('buildInvoiceContent', () => {
  it('computes amounts, VAT split and discount', () => {
    const { items, totals } = buildInvoiceContent([line], 100);
    expect(items[0]).toMatchObject({ no: 1, amount_incl_vat: 32100, amount_ex_vat: 30000, unit_price_ex_vat: 30 });
    expect(totals.gross_before_discount).toBe(32100);
    expect(totals.discount_incl_vat).toBe(100);
    expect(totals.net_incl_vat).toBe(32000);
    expect(totals.subtotal_ex_vat).toBe(29906.54);
    expect(totals.vat).toBe(2093.46);
    expect(totals.total_liters).toBe(1000);
  });

  it('clamps the discount to 0..gross', () => {
    expect(buildInvoiceContent([line], -5).totals.discount_incl_vat).toBe(0);
    expect(buildInvoiceContent([line], 999999).totals.net_incl_vat).toBe(0);
  });
});

describe('invoiceItemsFromSnapshot', () => {
  it('reads both the old issue snapshot and document items', () => {
    expect(invoiceItemsFromSnapshot([{ product_code: 'B7', product_name: 'ดีเซล', liters: 10, unit_price: 30, amount: 300, depot_label: null }]))
      .toEqual([{ product_code: 'B7', product_name: 'ดีเซล', depot_label: null, liters: 10, unit_price_incl_vat: 30 }]);
    expect(invoiceItemsFromSnapshot([{ product_code: 'G95', liters: 5, unit_price_incl_vat: 40, depot_label: 'X' }])[0])
      .toEqual({ product_code: 'G95', product_name: 'G95', depot_label: 'X', liters: 5, unit_price_incl_vat: 40 });
    expect(invoiceItemsFromSnapshot(null)).toEqual([]);
  });
});

describe('applyInvoiceContent', () => {
  const doc = {
    customer: { name: 'ลูกค้าเดิม', tax_id: '111', address: 'ที่อยู่เดิม', phone: '02' },
    items: buildInvoiceContent([{ ...line, liters: 1 }], 0).items,
    totals: buildInvoiceContent([{ ...line, liters: 1 }], 0).totals,
    remark: 'หมายเหตุเดิม',
    discount_note: 'โปร',
  } as unknown as OrderDocumentData;

  it('keeps the live order when not edited', () => {
    expect(applyInvoiceContent(doc, null)).toBe(doc);
    expect(applyInvoiceContent(doc, { content_overridden: false, customer_name: 'อื่น' })).toBe(doc);
  });

  it('prints the stored content when edited', () => {
    const out = applyInvoiceContent(doc, {
      content_overridden: true,
      customer_name: 'บริษัทใหม่ (สำนักงานใหญ่)',
      customer_tax_id: null,
      customer_address: 'ที่อยู่ใหม่',
      customer_phone: null,
      note: 'แก้ไขแล้ว',
      items_snapshot: [line],
      totals_snapshot: { discount_incl_vat: 100 },
    });
    expect(out.customer).toEqual({ name: 'บริษัทใหม่ (สำนักงานใหญ่)', tax_id: null, address: 'ที่อยู่ใหม่', phone: null });
    expect(out.items).toHaveLength(1);
    expect(out.totals.net_incl_vat).toBe(32000);
    expect(out.remark).toBe('แก้ไขแล้ว');
    expect(out.discount_note).toBe('โปร');
  });

  it('falls back to the order lines when the stored snapshot is empty', () => {
    const out = applyInvoiceContent(doc, { content_overridden: true, items_snapshot: [], totals_snapshot: null, note: null });
    expect(out.items).toBe(doc.items);
    expect(out.remark).toBeNull();
  });
});
