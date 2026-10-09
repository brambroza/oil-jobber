import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { baseDefinition, customerBlock, itemsTable, metaGrid, sellerBlock, signatures, totalsBlock, COLORS } from '@/lib/documents/pdf';
import { dateTh, money, liters } from '@/lib/documents/format';
import { thaiBahtText } from '@/lib/utils/thai-baht-text';
import type { OrderDocumentData } from '@/lib/documents/types';

/** ใบสั่งซื้อ: VAT-inclusive prices as agreed with the customer. */
export function buildPurchaseOrderPdf(data: OrderDocumentData): TDocumentDefinitions {
  const t = data.totals;
  return baseDefinition(`ใบสั่งซื้อ ${data.order_no}`, [
    {
      columns: [
        { width: '*', stack: [sellerBlock(data.seller)] },
        { width: 200, stack: [{ text: 'ใบสั่งซื้อ', fontSize: 17, bold: true, color: COLORS.accent, alignment: 'right' }, { text: 'Purchase Order', alignment: 'right', color: COLORS.muted }] },
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
    itemsTable(data.items, t, 'incl'),
    totalsBlock([
      { label: 'รวมปริมาณ', value: `${liters(t.total_liters)} ลิตร` },
      ...(t.discount_incl_vat > 0
        ? [
          { label: 'รวมรายการ (รวม VAT)', value: money(t.gross_before_discount) },
          { label: `หัก ส่วนลดท้ายบิล${data.discount_note ? ` (${data.discount_note})` : ''}`, value: `-${money(t.discount_incl_vat)}` },
        ]
        : []),
      { label: 'ยอดก่อน VAT', value: money(t.subtotal_ex_vat) },
      { label: 'ภาษีมูลค่าเพิ่ม 7%', value: money(t.vat) },
      { label: 'ยอดรวมสุทธิ', value: money(t.net_incl_vat), final: true },
    ]),
    { text: `(${thaiBahtText(t.net_incl_vat)})`, bold: true, alignment: 'right', margin: [0, 4, 0, 10] },
    {
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            { text: [{ text: 'วิธีรับสินค้า: ', bold: true }, data.receive_method_label, data.delivery_location ? `   สถานที่ส่ง: ${data.delivery_location}` : ''] },
            data.vehicle ? { text: [{ text: 'รถรับสินค้า: ', bold: true }, `${data.vehicle.license_plate || '-'}${data.vehicle.driver_name ? ` คนขับ ${data.vehicle.driver_name}` : ''}${data.vehicle.driver_phone ? ` โทร ${data.vehicle.driver_phone}` : ''}`] } : '',
            data.customer_po_no ? { text: [{ text: 'อ้างอิง PO ลูกค้า: ', bold: true }, data.customer_po_no] } : '',
            data.remark ? { text: [{ text: 'หมายเหตุ: ', bold: true }, data.remark] } : '',
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
