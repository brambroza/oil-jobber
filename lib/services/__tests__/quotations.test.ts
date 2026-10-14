import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ supabaseAdmin: {} }));
vi.mock('@/lib/documents/from-order', () => ({ loadOrderDocumentData: vi.fn() }));

import { applyQuotationSnapshot, buildQuotationSnapshot, todayBangkok, type QuotationRow } from '../quotations';
import { buildQuotationPdf } from '@/lib/documents/quotation';
import type { DocumentItem, DocumentTotals, OrderDocumentData } from '@/lib/documents/types';

/** Builds a document item. */
function item(code: string, litersValue: number, unitIncl: number): DocumentItem {
  return {
    no: 1,
    product_code: code,
    product_name: code,
    depot_label: null,
    liters: litersValue,
    unit_price_incl_vat: unitIncl,
    unit_price_ex_vat: unitIncl / 1.07,
    amount_incl_vat: litersValue * unitIncl,
    amount_ex_vat: (litersValue * unitIncl) / 1.07,
  };
}

/** Builds totals for a single net amount. */
function totals(net: number): DocumentTotals {
  return {
    total_liters: 1000,
    goods_incl_vat: net,
    delivery_fee_incl_vat: 0,
    delivery_fee_per_liter: 0,
    gross_before_discount: net,
    discount_incl_vat: 0,
    discount_ex_vat: 0,
    net_incl_vat: net,
    subtotal_ex_vat: net / 1.07,
    vat: net - net / 1.07,
    goods_ex_vat: net / 1.07,
    delivery_fee_ex_vat: 0,
  };
}

/** Minimal order document data. */
function orderDoc(overrides: Partial<OrderDocumentData> = {}): OrderDocumentData {
  return {
    order_id: 'o1',
    order_no: 'SO-2610140001',
    order_date: '2026-10-14T03:00:00Z',
    due_date: null,
    requested_delivery_date: null,
    credit_label: 'เงินสด',
    customer_po_no: null,
    sales_name: 'เซล A',
    sales_signature: null,
    approver_name: null,
    approver_signature: null,
    approved_at: null,
    approval_note: null,
    approved_over_credit: false,
    seller: { name: 'ผู้ขาย', branch: null, address: null, tax_id: null, phone: null, email: null, logo_url: null },
    customer: { name: 'ลูกค้าปัจจุบัน', address: 'ที่อยู่ใหม่', tax_id: '111', phone: '02' },
    items: [item('B7', 1000, 32)],
    totals: totals(32000),
    remark: null,
    discount_note: null,
    receive_method_label: 'รับเอง',
    delivery_location: null,
    vehicle: null,
    invoice: null,
    delivery: null,
    payments: [],
    paid_amount: 0,
    outstanding_amount: 32000,
    ...overrides,
  };
}

/** Quotation row built from a snapshot of `doc`. */
function quotationRow(doc: OrderDocumentData, extra: Partial<QuotationRow> = {}): QuotationRow {
  return {
    id: 'q1',
    sale_order_id: doc.order_id,
    quotation_no: 'QT-2610140001',
    issued_at: '2026-10-14',
    valid_until: '2026-10-15',
    note: 'ราคารวมค่าขนส่ง',
    status: 'ISSUED',
    ...buildQuotationSnapshot(doc),
    ...extra,
  };
}

describe('todayBangkok', () => {
  it('uses the Asia/Bangkok date, not UTC', () => {
    expect(todayBangkok(new Date('2026-10-13T18:30:00Z'))).toBe('2026-10-14');
  });
});

describe('buildQuotationSnapshot', () => {
  it('captures customer, items, totals and net amount', () => {
    const doc = orderDoc();
    const snapshot = buildQuotationSnapshot(doc);
    expect(snapshot.customer_name).toBe('ลูกค้าปัจจุบัน');
    expect(snapshot.items_snapshot).toEqual(doc.items);
    expect(snapshot.totals_snapshot).toEqual(doc.totals);
    expect(snapshot.total_amount).toBe(32000);
  });
});

describe('applyQuotationSnapshot', () => {
  it('prints the snapshot even after the order changed', () => {
    const issued = quotationRow(orderDoc());
    const edited = orderDoc({
      customer: { name: 'ชื่อแก้ไขแล้ว', address: null, tax_id: null, phone: null },
      items: [item('B7', 2000, 35)],
      totals: totals(70000),
    });
    const data = applyQuotationSnapshot(edited, issued);
    expect(data.items[0].liters).toBe(1000);
    expect(data.totals.net_incl_vat).toBe(32000);
    expect(data.customer.name).toBe('ลูกค้าปัจจุบัน');
    expect(data.quotation).toEqual({ quotation_no: 'QT-2610140001', issued_at: '2026-10-14', valid_until: '2026-10-15', note: 'ราคารวมค่าขนส่ง' });
  });

  it('falls back to live order data when the snapshot is empty', () => {
    const doc = orderDoc();
    const data = applyQuotationSnapshot(doc, quotationRow(doc, { items_snapshot: [], totals_snapshot: {}, customer_name: null }));
    expect(data.items).toEqual(doc.items);
    expect(data.totals).toEqual(doc.totals);
    expect(data.customer.name).toBe('ลูกค้าปัจจุบัน');
  });
});

describe('buildQuotationPdf', () => {
  it('titles the document with the quotation number and references the sale order', () => {
    const doc = orderDoc();
    const definition = buildQuotationPdf(applyQuotationSnapshot(doc, quotationRow(doc)));
    expect(definition.info?.title).toBe('ใบเสนอราคา QT-2610140001');
    const text = JSON.stringify(definition.content);
    expect(text).toContain('Quotation');
    expect(text).toContain('SO-2610140001');
    expect(text).toContain('ยืนราคาถึง');
  });
});
