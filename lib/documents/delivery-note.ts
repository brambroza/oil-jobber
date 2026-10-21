import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import { baseDefinition, customerBlock, metaGrid, sellerBlock, signatures, COLORS } from '@/lib/documents/pdf';
import { dateTh, liters as formatLiters, phoneTh } from '@/lib/documents/format';
import type { OrderDocumentData } from '@/lib/documents/types';

function headerCell(text: string, alignment: 'left' | 'right' | 'center' = 'left'): TableCell {
  return { text, bold: true, fillColor: COLORS.accentSoft, color: '#4e4a78', alignment, margin: [4, 4, 4, 4] };
}

/** Item table with quantities only — the delivery note never shows prices or amounts. */
function deliveryItemsTable(data: OrderDocumentData): Content {
  const body: TableCell[][] = [[
    headerCell('#', 'center'),
    headerCell('รายการ'),
    headerCell('จำนวน (ลิตร)', 'right'),
  ]];
  for (const it of data.items) {
    body.push([
      { text: String(it.no), alignment: 'center', margin: [4, 3, 4, 3] },
      { stack: [{ text: it.product_name, bold: true }, it.depot_label ? { text: it.depot_label, color: COLORS.muted, fontSize: 8.5 } : ''], margin: [4, 3, 4, 3] },
      { text: formatLiters(it.liters), alignment: 'right', margin: [4, 3, 4, 3] },
    ]);
  }
  if (!data.items.length) {
    body.push([{ text: 'ไม่พบรายการสินค้า', colSpan: 3, margin: [4, 6, 4, 6], color: COLORS.muted }, '', '']);
  }
  body.push([
    { text: '', margin: [4, 3, 4, 3] },
    { text: 'รวมจำนวน', bold: true, alignment: 'right', margin: [4, 3, 4, 3] },
    { text: formatLiters(data.totals.total_liters), bold: true, alignment: 'right', margin: [4, 3, 4, 3] },
  ]);
  return {
    table: { headerRows: 1, widths: [22, '*', 110], body },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i >= node.table.body.length - 1 ? 0.8 : 0.4),
      vLineWidth: () => 0,
      hLineColor: () => COLORS.line,
    },
    margin: [0, 10, 0, 10],
  };
}

/**
 * ใบส่งของ (Delivery Note): products and quantities only, no unit prices,
 * amounts or totals. Numbered after the tax invoice when one exists,
 * otherwise after the sale order.
 */
export function buildDeliveryNotePdf(data: OrderDocumentData, copy: 'original' | 'copy' = 'original'): TDocumentDefinitions {
  const inv = data.invoice;
  const docNo = inv?.invoice_no || data.order_no;
  return baseDefinition(`ใบส่งของ ${docNo}`, [
    {
      columns: [
        { width: '*', stack: [sellerBlock(data.seller)] },
        {
          width: 230,
          stack: [
            { text: 'ใบส่งของ', fontSize: 15, bold: true, color: COLORS.accent, alignment: 'right' },
            { text: 'Delivery Note', alignment: 'right', color: COLORS.muted, fontSize: 9 },
            { text: copy === 'original' ? 'ต้นฉบับ' : 'สำเนา', alignment: 'right', bold: true, margin: [0, 4, 0, 0] },
          ],
        },
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
                { label: 'เลขที่', value: docNo },
                { label: 'วันที่', value: dateTh(inv?.issued_at || data.order_date) },
                { label: 'วันที่ส่งของ', value: dateTh(data.delivery?.delivered_at || data.requested_delivery_date || data.order_date) },
              ],
              [
                { label: 'อ้างอิง PO', value: data.customer_po_no || data.order_no },
                { label: 'ใบสั่งขาย', value: data.order_no },
                { label: 'พนักงานขาย', value: data.sales_name || '-' },
              ],
            ]),
          ],
        },
      ],
      columnGap: 14,
    },
    deliveryItemsTable(data),
    {
      table: {
        widths: ['*'],
        body: [[{
          stack: [
            { text: [{ text: 'วิธีรับสินค้า: ', bold: true }, data.receive_method_label, data.delivery_location ? `   สถานที่ส่ง: ${data.delivery_location}` : ''] },
            data.remark ? { text: [{ text: 'หมายเหตุ: ', bold: true }, data.remark] } : '',
            data.vehicle ? { text: [{ text: 'รถ: ', bold: true }, `${data.vehicle.license_plate || '-'}${data.vehicle.driver_name ? ` คนขับ ${data.vehicle.driver_name}` : ''}${data.vehicle.driver_phone ? ` ${phoneTh(data.vehicle.driver_phone)}` : ''}`] } : '',
          ],
          margin: [8, 6, 8, 6],
          fillColor: '#fafafe',
        }]],
      },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => COLORS.line, vLineColor: () => COLORS.line },
    },
    signatures(['ผู้รับสินค้า', 'ผู้ส่งสินค้า', 'ผู้ออกเอกสาร']),
  ]);
}
