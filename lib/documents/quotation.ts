import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { baseDefinition, customerBlock, itemsTable, metaGrid, sellerBlock, signatures, totalsBlock, vatTotalsRows, COLORS } from '@/lib/documents/pdf';
import { dateTh, liters } from '@/lib/documents/format';
import { thaiBahtText } from '@/lib/utils/thai-baht-text';
import type { QuotationDocumentData } from '@/lib/documents/types';
import { DEFAULT_VAT_MODE, type VatMode } from '@/lib/documents/vat-mode';

/**
 * ใบเสนอราคา: prices offered to the customer, from the snapshot taken when
 * the quotation was issued.
 *
 * @param data - order context with quotation snapshot
 * @param vatMode - show prices excl. VAT (default) or incl. VAT
 * @returns pdfmake document definition
 */
export function buildQuotationPdf(data: QuotationDocumentData, vatMode: VatMode = DEFAULT_VAT_MODE): TDocumentDefinitions {
  const t = data.totals;
  const q = data.quotation;
  return baseDefinition(`ใบเสนอราคา ${q.quotation_no}`, [
    {
      columns: [
        { width: '*', stack: [sellerBlock(data.seller)] },
        { width: 200, stack: [{ text: 'ใบเสนอราคา', fontSize: 17, bold: true, color: COLORS.accent, alignment: 'right' }, { text: 'Quotation', alignment: 'right', color: COLORS.muted }] },
      ],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 523, y2: 6, lineWidth: 0.6, lineColor: COLORS.line }], margin: [0, 0, 0, 8] },
    {
      columns: [
        { width: '*', stack: [customerBlock(data.customer)] },
        {
          width: 270,
          stack: [
            metaGrid([
              [
                { label: 'เลขที่', value: q.quotation_no },
                { label: 'วันที่', value: dateTh(q.issued_at) },
                { label: 'ยืนราคาถึง', value: dateTh(q.valid_until) },
              ],
              [
                { label: 'เครดิต', value: data.credit_label || '-' },
                { label: 'อ้างอิงใบสั่งขาย', value: data.order_no },
                { label: 'พนักงานขาย', value: data.sales_name || '-' },
              ],
            ]),
          ],
        },
      ],
      columnGap: 14,
    },
    itemsTable(data.items, t, vatMode),
    totalsBlock([
      { label: 'รวมปริมาณ', value: `${liters(t.total_liters)} ลิตร` },
      ...vatTotalsRows(t, vatMode, { discountNote: data.discount_note }),
    ]),
    { text: `(${thaiBahtText(t.net_incl_vat)})`, bold: true, alignment: 'right', margin: [0, 4, 0, 10] },
    {
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            { text: [{ text: 'วิธีรับสินค้า: ', bold: true }, data.receive_method_label, data.delivery_location ? `   สถานที่ส่ง: ${data.delivery_location}` : ''] },
            q.note ? { text: [{ text: 'หมายเหตุ: ', bold: true }, q.note] } : '',
            {
              text: `ราคาน้ำมันเปลี่ยนแปลงตามประกาศโรงกลั่น ราคานี้ยืนถึง${q.valid_until ? ` ${dateTh(q.valid_until)}` : 'วันที่ออกเอกสาร'} เท่านั้น`,
              color: COLORS.muted,
            },
          ],
          margin: [8, 6, 8, 6],
          fillColor: '#fafafe',
        }]],
      },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => COLORS.line, vLineColor: () => COLORS.line },
    },
    signatures([
      'ผู้อนุมัติสั่งซื้อ (ลูกค้า)',
      { label: 'ผู้เสนอราคา', name: data.sales_name, image: data.sales_signature, date: dateTh(q.issued_at) },
    ]),
  ]);
}
