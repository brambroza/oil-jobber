import { describe, expect, it } from 'vitest';
import { parseVatMode, supportsVatMode, DEFAULT_VAT_MODE } from '../vat-mode';
import { vatTotalsRows } from '../pdf';
import { buildPurchaseOrderPdf } from '../purchase-order';
import { buildTaxInvoicePdf } from '../tax-invoice';
import { buildQuotationPdf } from '../quotation';
import type { DocumentTotals, OrderDocumentData, QuotationDocumentData } from '../types';

const totals: DocumentTotals = {
  total_liters: 1000, goods_incl_vat: 32100, delivery_fee_incl_vat: 0, delivery_fee_per_liter: 0,
  gross_before_discount: 32100, discount_incl_vat: 0, discount_ex_vat: 0, net_incl_vat: 32100,
  subtotal_ex_vat: 30000, vat: 2100, goods_ex_vat: 30000, delivery_fee_ex_vat: 0,
};

const discounted: DocumentTotals = {
  ...totals, discount_incl_vat: 107, discount_ex_vat: 100, net_incl_vat: 31993, subtotal_ex_vat: 29900, vat: 2093,
};

/** Order document with distinct incl/excl unit prices so the item table mode is detectable. */
function sampleData(overrides: Partial<OrderDocumentData> = {}): OrderDocumentData {
  return {
    order_id: 'o1', price_vat_mode: 'excl', order_no: 'SO-1', order_date: '2026-11-09', due_date: null, requested_delivery_date: null,
    credit_label: null, customer_po_no: null, sales_name: null, sales_signature: null, approver_name: null,
    approver_signature: null, approved_at: null, approval_note: null, approved_over_credit: false,
    seller: { name: 'ผู้ขาย', branch: null, address: null, tax_id: null, phone: null, email: null, logo_url: null },
    customer: { name: 'ลูกค้า', address: null, tax_id: null, phone: null },
    items: [{
      no: 1, product_code: 'B7', product_name: 'ดีเซล B7', depot_label: null, liters: 1000,
      unit_price_incl_vat: 32.1, unit_price_ex_vat: 30, amount_incl_vat: 32100, amount_ex_vat: 30000,
    }],
    totals, remark: null, discount_note: null, receive_method_label: 'จัดส่ง', delivery_location: null, vehicle: null,
    invoice: { invoice_no: 'IV-1', issued_at: '2026-11-09', due_date: null, status: 'ISSUED' },
    delivery: null, payments: [], paid_amount: 0, outstanding_amount: 0,
    ...overrides,
  };
}

const content = (def: { content: unknown }) => JSON.stringify(def.content);

describe('parseVatMode', () => {
  it('defaults to excl for anything but incl', () => {
    expect(DEFAULT_VAT_MODE).toBe('excl');
    expect(parseVatMode('incl')).toBe('incl');
    expect(parseVatMode('excl')).toBe('excl');
    expect(parseVatMode(null)).toBe('excl');
    expect(parseVatMode(undefined)).toBe('excl');
    expect(parseVatMode('INCL')).toBe('excl');
    expect(parseVatMode(1)).toBe('excl');
  });
});

describe('supportsVatMode', () => {
  it('only applies to priced documents', () => {
    expect(supportsVatMode('purchase-order')).toBe(true);
    expect(supportsVatMode('quotation')).toBe(true);
    expect(supportsVatMode('tax-invoice')).toBe(true);
    expect(supportsVatMode('delivery-note')).toBe(false);
    expect(supportsVatMode('receipt')).toBe(false);
    expect(supportsVatMode('delivery-record')).toBe(false);
  });
});

describe('vatTotalsRows', () => {
  it('excl without discount: subtotal ex VAT, VAT, total', () => {
    expect(vatTotalsRows(totals, 'excl').map((r) => [r.label, r.value])).toEqual([
      ['รวมเงิน (ก่อน VAT)', '30,000.00'],
      ['ภาษีมูลค่าเพิ่ม 7%', '2,100.00'],
      ['ยอดรวมสุทธิ', '32,100.00'],
    ]);
  });

  it('excl with discount deducts the ex-VAT discount', () => {
    const rows = vatTotalsRows(discounted, 'excl', { discountNote: 'ลูกค้าประจำ', finalLabel: 'จำนวนเงินรวมทั้งสิ้น' });
    expect(rows.map((r) => r.value)).toEqual(['30,000.00', '-100.00', '29,900.00', '2,093.00', '31,993.00']);
    expect(rows[1].label).toContain('ลูกค้าประจำ');
    expect(rows[rows.length - 1]).toMatchObject({ label: 'จำนวนเงินรวมทั้งสิ้น', final: true });
  });

  it('incl with discount deducts the incl-VAT discount from the gross', () => {
    expect(vatTotalsRows(discounted, 'incl').map((r) => r.value)).toEqual(['32,100.00', '-107.00', '29,900.00', '2,093.00', '31,993.00']);
  });

  it('incl without discount starts at the pre-VAT amount', () => {
    expect(vatTotalsRows(totals, 'incl').map((r) => r.label)).toEqual(['ยอดก่อน VAT', 'ภาษีมูลค่าเพิ่ม 7%', 'ยอดรวมสุทธิ']);
  });
});

describe('document builders honour the VAT mode', () => {
  const quotation: QuotationDocumentData = {
    ...sampleData(),
    quotation: { quotation_no: 'QT-1', issued_at: '2026-11-09', valid_until: null, note: null },
  };
  const builders: Array<[string, (mode?: 'excl' | 'incl') => { content: unknown }]> = [
    ['purchase order', (mode) => buildPurchaseOrderPdf(sampleData(), mode)],
    ['quotation', (mode) => buildQuotationPdf(quotation, mode)],
    ['tax invoice', (mode) => buildTaxInvoicePdf(sampleData(), 'original', mode)],
  ];

  for (const [name, build] of builders) {
    it(`${name} defaults to prices excl. VAT`, () => {
      const json = content(build());
      expect(json).toContain('ราคา/ลิตร (ก่อน VAT)');
      expect(json).not.toContain('ราคา/ลิตร (รวม VAT)');
      expect(json).toContain('30.0000');
    });

    it(`${name} can show prices incl. VAT`, () => {
      const json = content(build('incl'));
      expect(json).toContain('ราคา/ลิตร (รวม VAT)');
      expect(json).not.toContain('ราคา/ลิตร (ก่อน VAT)');
      expect(json).toContain('32.10');
      expect(json).toContain('32,100.00');
    });
  }
});
