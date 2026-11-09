import { round2, splitVat, VAT_MULTIPLIER } from '@/lib/services/order-pricing';
import type { CustomerInfo, DocumentItem, DocumentTotals, OrderDocumentData } from '@/lib/documents/types';

/**
 * Editable content of a tax invoice (หน้าใบกำกับภาษี > แก้ไข). Client-safe so
 * the edit dialog can preview totals with the same maths the server stores.
 *
 * Items are the printed lines: unit prices are VAT-inclusive and already
 * include the delivery fee (documents fold the fee into the per-liter price),
 * so there is no separate delivery fee on an edited invoice.
 */
export type InvoiceItemInput = {
  product_code: string;
  product_name: string;
  depot_label: string | null;
  liters: number;
  /** บาท/ลิตร รวม VAT */
  unit_price_incl_vat: number;
};

/** Stored invoice row fields used to print an edited invoice. */
export type InvoiceContentRow = {
  content_overridden?: boolean | null;
  customer_name?: string | null;
  customer_tax_id?: string | null;
  customer_address?: string | null;
  customer_phone?: string | null;
  note?: string | null;
  items_snapshot?: unknown;
  totals_snapshot?: unknown;
};

/**
 * Builds printed items and totals from edited lines and an end-of-bill discount.
 *
 * @param items - edited lines (liters × VAT-inclusive unit price)
 * @param discountInclVat - ส่วนลดท้ายบิล incl. VAT (clamped to 0..gross)
 * @returns document items and totals, rounded like the order documents
 */
export function buildInvoiceContent(
  items: InvoiceItemInput[],
  discountInclVat: number,
): { items: DocumentItem[]; totals: DocumentTotals } {
  const docItems: DocumentItem[] = items.map((it, index) => {
    const liters = Number(it.liters || 0);
    const unitIncl = Number(it.unit_price_incl_vat || 0);
    const amountIncl = round2(liters * unitIncl);
    return {
      no: index + 1,
      product_code: String(it.product_code || '').trim(),
      product_name: String(it.product_name || it.product_code || '').trim(),
      depot_label: it.depot_label ? String(it.depot_label).trim() || null : null,
      liters,
      unit_price_incl_vat: unitIncl,
      unit_price_ex_vat: Number((unitIncl / VAT_MULTIPLIER).toFixed(4)),
      amount_incl_vat: amountIncl,
      amount_ex_vat: round2(amountIncl / VAT_MULTIPLIER),
    };
  });

  const totalLiters = docItems.reduce((sum, it) => sum + it.liters, 0);
  const grossBefore = round2(docItems.reduce((sum, it) => sum + it.amount_incl_vat, 0));
  const discountIncl = round2(Math.min(grossBefore, Math.max(0, Number(discountInclVat || 0))));
  const netIncl = round2(grossBefore - discountIncl);
  const { subtotal, vat } = splitVat(netIncl);

  return {
    items: docItems,
    totals: {
      total_liters: totalLiters,
      goods_incl_vat: grossBefore,
      delivery_fee_incl_vat: 0,
      delivery_fee_per_liter: 0,
      gross_before_discount: grossBefore,
      discount_incl_vat: discountIncl,
      discount_ex_vat: round2(discountIncl / VAT_MULTIPLIER),
      net_incl_vat: netIncl,
      subtotal_ex_vat: subtotal,
      vat,
      goods_ex_vat: round2(grossBefore / VAT_MULTIPLIER),
      delivery_fee_ex_vat: 0,
    },
  };
}

/**
 * Turns a stored `items_snapshot` (old rows keep `unit_price` / `amount`, new
 * rows keep full document items) into editable lines.
 * @param snapshot - raw jsonb value
 */
export function invoiceItemsFromSnapshot(snapshot: unknown): InvoiceItemInput[] {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.map((raw) => {
    const it = (raw ?? {}) as Record<string, unknown>;
    return {
      product_code: String(it.product_code ?? ''),
      product_name: String(it.product_name ?? it.product_code ?? ''),
      depot_label: it.depot_label ? String(it.depot_label) : null,
      liters: Number(it.liters ?? 0),
      unit_price_incl_vat: Number(it.unit_price_incl_vat ?? it.unit_price ?? 0),
    };
  });
}

/**
 * Prints an edited invoice: when `content_overridden` the stored customer,
 * items, totals and note replace the live order data; otherwise the order
 * document data is returned unchanged.
 *
 * @param doc - live order document data
 * @param row - stored invoice content
 */
export function applyInvoiceContent(doc: OrderDocumentData, row: InvoiceContentRow | null | undefined): OrderDocumentData {
  if (!row?.content_overridden) return doc;
  const lines = invoiceItemsFromSnapshot(row.items_snapshot);
  const storedTotals = row.totals_snapshot as Partial<DocumentTotals> | null | undefined;
  const built = buildInvoiceContent(lines, Number(storedTotals?.discount_incl_vat ?? 0));
  const customer: CustomerInfo = {
    name: row.customer_name || doc.customer.name,
    // แก้ไขแล้ว: ช่องที่ลบทิ้ง (null) ต้องพิมพ์ว่าง ไม่ย้อนกลับไปใช้ข้อมูลลูกค้าในระบบ
    tax_id: row.customer_tax_id ?? null,
    address: row.customer_address ?? null,
    phone: row.customer_phone ?? null,
  };
  return {
    ...doc,
    customer,
    items: built.items.length ? built.items : doc.items,
    totals: built.items.length ? built.totals : doc.totals,
    remark: row.note ?? null,
    discount_note: built.totals.discount_incl_vat > 0 ? doc.discount_note : null,
  };
}
