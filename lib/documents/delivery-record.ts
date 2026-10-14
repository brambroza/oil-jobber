import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import { baseDefinition, customerBlock, metaGrid, sellerBlock, signatures, COLORS } from '@/lib/documents/pdf';
import { dateTh, liters as formatLiters, phoneTh } from '@/lib/documents/format';
import type { OrderDocumentData } from '@/lib/documents/types';
import { formatDateTime } from '@/lib/utils/date-format';

/** `2026-10-09T08:30:00Z` → `09/10/2026 15:30` (Bangkok). */
function dateTimeTh(value: string | null | undefined): string {
  return formatDateTime(value);
}

function headerCell(text: string, sub: string, alignment: 'left' | 'right' | 'center' = 'left'): TableCell {
  return {
    stack: [{ text, bold: true }, { text: sub, fontSize: 7.5, bold: false }],
    fillColor: COLORS.accentSoft,
    color: '#4e4a78',
    alignment,
    margin: [4, 4, 4, 4],
  };
}

/** Quantity table: จำนวน / บรรจุแล้ว / ส่งแล้ว / ได้รับของแล้ว (no prices). */
function quantityTable(data: OrderDocumentData): Content {
  const body: TableCell[][] = [[
    headerCell('#', '', 'center'),
    headerCell('รายละเอียด', 'Product Description'),
    headerCell('จำนวน', 'Quantity', 'right'),
    headerCell('บรรจุแล้ว', 'Packed', 'right'),
    headerCell('ส่งแล้ว', 'Shipped', 'right'),
    headerCell('ได้รับของแล้ว', 'Delivered', 'right'),
  ]];
  const location = data.delivery_location || data.receive_method_label;
  for (const it of data.items) {
    const qty = formatLiters(it.liters);
    body.push([
      { text: String(it.no), alignment: 'center', margin: [4, 3, 4, 3] },
      {
        stack: [
          { text: it.product_name, bold: true },
          it.depot_label ? { text: it.depot_label, color: COLORS.muted, fontSize: 8.5 } : '',
          { text: location, color: COLORS.muted, fontSize: 8.5 },
        ],
        margin: [4, 3, 4, 3],
      },
      { text: qty, alignment: 'right', margin: [4, 3, 4, 3] },
      { text: qty, alignment: 'right', margin: [4, 3, 4, 3], fillColor: COLORS.accentSoft },
      { text: qty, alignment: 'right', margin: [4, 3, 4, 3] },
      { text: qty, alignment: 'right', margin: [4, 3, 4, 3], fillColor: COLORS.accentSoft },
    ]);
  }
  if (!data.items.length) {
    body.push([{ text: 'ไม่พบรายการสินค้า', colSpan: 6, margin: [4, 6, 4, 6], color: COLORS.muted }, '', '', '', '', '']);
  }
  return {
    table: { headerRows: 1, widths: [22, '*', 70, 70, 70, 80], body },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0.8 : 0.4),
      vLineWidth: () => 0,
      hLineColor: () => COLORS.line,
    },
    margin: [0, 10, 0, 6],
  };
}

/** บันทึกการส่งของ (Delivery Record): quantities only, receiver + staff signature. */
export function buildDeliveryRecordPdf(data: OrderDocumentData): TDocumentDefinitions {
  const delivery = data.delivery;
  const total = formatLiters(data.totals.total_liters);
  const totalsRows: TableCell[][] = [
    [{ text: 'บรรจุแล้ว', bold: true, margin: [6, 3, 6, 3] }, { text: total, alignment: 'right', bold: true, margin: [6, 3, 6, 3] }],
    [{ text: 'ส่งแล้ว', bold: true, margin: [6, 3, 6, 3] }, { text: total, alignment: 'right', bold: true, margin: [6, 3, 6, 3] }],
    [
      { text: 'ได้รับแล้ว (ลิตร)', bold: true, fillColor: COLORS.accent, color: '#fff', margin: [6, 3, 6, 3] },
      { text: total, alignment: 'right', bold: true, fillColor: COLORS.accent, color: '#fff', margin: [6, 3, 6, 3] },
    ],
  ];

  return baseDefinition(`บันทึกการส่งของ ${delivery?.record_no || data.order_no}`, [
    {
      columns: [
        { width: '*', stack: [sellerBlock(data.seller)] },
        {
          width: 230,
          stack: [
            { text: 'บันทึกการส่งของ', fontSize: 15, bold: true, color: COLORS.accent, alignment: 'right' },
            { text: 'Delivery Record', alignment: 'right', color: COLORS.muted, fontSize: 9 },
          ],
        },
      ],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 523, y2: 6, lineWidth: 0.6, lineColor: COLORS.line }], margin: [0, 0, 0, 8] },
    {
      columns: [
        { width: '*', stack: [customerBlock(data.customer, 'ข้อมูลลูกค้า')] },
        {
          width: 270,
          stack: [
            metaGrid([
              [
                { label: 'เลขที่เอกสาร', value: delivery?.record_no || '-' },
                { label: 'วันที่ส่งของ', value: dateTh(delivery?.delivered_at || data.requested_delivery_date || data.order_date) },
                { label: 'เอกสารอ้างอิง', value: data.customer_po_no || data.order_no },
              ],
              [
                { label: 'ใบสั่งขาย', value: data.order_no },
                { label: 'ใบกำกับภาษี', value: data.invoice?.invoice_no || '-' },
                { label: 'พนักงานขาย', value: data.sales_name || '-' },
              ],
            ]),
          ],
        },
      ],
      columnGap: 14,
    },
    quantityTable(data),
    {
      columns: [
        {
          width: '*',
          stack: [
            { text: `วิธีรับสินค้า: ${data.receive_method_label}${data.delivery_location ? `   สถานที่ส่ง: ${data.delivery_location}` : ''}`, color: COLORS.muted, fontSize: 9 },
            data.remark ? { text: [{ text: 'หมายเหตุ: ', bold: true }, data.remark], fontSize: 9 } : '',
            data.vehicle
              ? { text: `รถ: ${data.vehicle.license_plate || '-'}   คนขับ: ${data.vehicle.driver_name || '-'}${data.vehicle.driver_phone ? `\u00A0(${phoneTh(data.vehicle.driver_phone, '')})` : ''}`, color: COLORS.muted, fontSize: 9 }
              : '',
            delivery ? { text: `เวลาส่งของ: ${dateTimeTh(delivery.delivered_at)}`, margin: [0, 6, 0, 0] } : '',
            delivery?.receiver_name ? { text: `ผู้รับของ: ${delivery.receiver_name}` } : '',
            delivery?.note ? { text: [{ text: 'หมายเหตุการส่งของ: ', bold: true }, delivery.note], margin: [0, 4, 0, 0] } : '',
          ],
        },
        { width: 240, table: { widths: ['*', 90], body: totalsRows }, layout: 'noBorders' },
      ],
      columnGap: 14,
    },
    signatures([
      { label: 'ผู้รับสินค้า', name: delivery?.receiver_name ?? null, date: delivery ? dateTh(delivery.delivered_at) : null },
      'ผู้ส่งสินค้า',
      {
        label: 'ผู้บันทึกการส่งของ',
        name: delivery?.recorded_by_name ?? null,
        image: delivery?.recorded_by_signature ?? null,
        date: delivery ? dateTh(delivery.delivered_at) : null,
      },
    ]),
  ]);
}
