import { describe, expect, it } from 'vitest';
import { buildDeliveryNotePdf } from '../delivery-note';
import type { OrderDocumentData } from '../types';

/** Minimal order document with distinctive price values that must not leak into the delivery note. */
function sampleData(overrides: Partial<OrderDocumentData> = {}): OrderDocumentData {
  return {
    order_id: 'o1',
    order_no: 'SO-2610140001',
    order_date: '2026-10-14',
    due_date: null,
    requested_delivery_date: null,
    credit_label: null,
    customer_po_no: null,
    sales_name: 'สมชาย',
    sales_signature: null,
    approver_name: null,
    approver_signature: null,
    approved_at: null,
    approval_note: null,
    approved_over_credit: false,
    seller: { name: 'ผู้ขาย', branch: null, address: null, tax_id: null, phone: null, email: null, logo_url: null },
    customer: { name: 'ลูกค้า', address: null, tax_id: null, phone: null },
    items: [{
      no: 1, product_code: 'B7', product_name: 'ดีเซล B7', depot_label: 'คลังศรีราชา', liters: 12000,
      unit_price_incl_vat: 31.4567, unit_price_ex_vat: 29.3988, amount_incl_vat: 377480.4, amount_ex_vat: 352785.42,
    }],
    totals: {
      total_liters: 12000, goods_incl_vat: 377480.4, delivery_fee_incl_vat: 1234.56, delivery_fee_per_liter: 0.1029,
      gross_before_discount: 378714.96, discount_incl_vat: 0, discount_ex_vat: 0, net_incl_vat: 378714.96,
      subtotal_ex_vat: 353939.21, vat: 24775.75, goods_ex_vat: 352785.42, delivery_fee_ex_vat: 1153.79,
    },
    remark: null,
    discount_note: null,
    receive_method_label: 'จัดส่ง',
    delivery_location: 'โรงงาน A',
    vehicle: null,
    invoice: null,
    delivery: null,
    payments: [],
    paid_amount: 0,
    outstanding_amount: 0,
    ...overrides,
  };
}

describe('buildDeliveryNotePdf', () => {
  it('shows products and liters but no prices or amounts', () => {
    const json = JSON.stringify(buildDeliveryNotePdf(sampleData()).content);
    expect(json).toContain('ใบส่งของ');
    expect(json).toContain('ดีเซล B7');
    expect(json).toContain('12,000');
    for (const leaked of ['31.4', '29.39', '377,480', '352,785', '378,714', '24,775', '1,234', 'ราคา', 'จำนวนเงิน', 'ภาษีมูลค่าเพิ่ม']) {
      expect(json).not.toContain(leaked);
    }
  });

  it('uses the invoice number when issued, otherwise the order number', () => {
    expect(JSON.stringify(buildDeliveryNotePdf(sampleData()).content)).toContain('SO-2610140001');
    const withInvoice = sampleData({ invoice: { invoice_no: 'IV-2610140001', issued_at: '2026-10-14', due_date: null, status: 'ISSUED' } });
    expect(JSON.stringify(buildDeliveryNotePdf(withInvoice).content)).toContain('IV-2610140001');
  });

  it('marks the copy', () => {
    expect(JSON.stringify(buildDeliveryNotePdf(sampleData(), 'copy').content)).toContain('สำเนา');
  });
});
