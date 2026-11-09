import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { baseDefinition, customerBlock, itemsTable, metaGrid, sellerBlock, signatures, totalsBlock, vatTotalsRows, COLORS } from '@/lib/documents/pdf';
import { dateTh, liters, phoneTh } from '@/lib/documents/format';
import { thaiBahtText } from '@/lib/utils/thai-baht-text';
import type { OrderDocumentData } from '@/lib/documents/types';
import { DEFAULT_VAT_MODE, type VatMode } from '@/lib/documents/vat-mode';

/**
 * ใบสั่งขาย.
 * @param data - order document data
 * @param vatMode - show prices excl. VAT (default) or incl. VAT
 */
export function buildPurchaseOrderPdf(data: OrderDocumentData, vatMode: VatMode = DEFAULT_VAT_MODE): TDocumentDefinitions {
  const t = data.totals;
  return baseDefinition(`ใบสั่งขาย ${data.order_no}`, [
    {
      columns: [
        { width: '*', stack: [sellerBlock(data.seller)] },
        { width: 200, stack: [{ text: 'ใบสั่งขาย', fontSize: 17, bold: true, color: COLORS.accent, alignment: 'right' }, { text: 'Sales Order', alignment: 'right', color: COLORS.muted }] },
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
                { label: 'เลขที่', value: data.order_no },
              { label: 'วันที่', value: dateTh(data.order_date) },
              { label: 'กำหนดส่ง', value: dateTh(data.requested_delivery_date) },
              ],
              [
                { label: 'เครดิต', value: data.credit_label || '-' },
              { label: 'กำหนดชำระ', value: dateTh(data.due_date) },
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
            data.remark ? { text: [{ text: 'หมายเหตุ: ', bold: true }, data.remark] } : '',
            data.vehicle ? { text: [{ text: 'รถรับสินค้า: ', bold: true }, `${data.vehicle.license_plate || '-'}${data.vehicle.driver_name ? ` คนขับ ${data.vehicle.driver_name}` : ''}${data.vehicle.driver_phone ? ` ${phoneTh(data.vehicle.driver_phone)}` : ''}`] } : '',
            data.customer_po_no ? { text: [{ text: 'อ้างอิง PO ลูกค้า: ', bold: true }, data.customer_po_no] } : '',
          ],
          margin: [8, 6, 8, 6],
          fillColor: '#fafafe',
        }]],
      },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => COLORS.line, vLineColor: () => COLORS.line },
    },
    signatures([
      'ผู้สั่งซื้อ',
      { label: 'พนักงานขาย', name: data.sales_name, image: data.sales_signature, date: dateTh(data.order_date) },
      { label: 'ผู้อนุมัติ', name: data.approver_name, image: data.approver_signature, date: data.approved_at ? dateTh(data.approved_at) : null },
    ]),
  ]);
}
