import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import { baseDefinition, customerBlock, itemsTable, metaGrid, sellerBlock, signatureBoxes, totalsBlock, COLORS } from '@/lib/documents/pdf';
import { dateTh, money, phoneTh } from '@/lib/documents/format';
import { round2 } from '@/lib/services/order-pricing';
import { thaiBahtText } from '@/lib/utils/thai-baht-text';
import type { OrderDocumentData } from '@/lib/documents/types';

/** Payee printed in the payment note at the bottom of the tax invoice. */
const PAYEE_NAME = 'บริษัท เจเอฟซี โซลูชั่น จำกัด';
const PAYEE_BANK_ACCOUNT = '186-362-082-8 ธ.กสิกรไทย สาขาทองหล่อ 20';

/** Height (pt) of the notes + signature block pinned to the page bottom. */
const PAGE_BOTTOM_HEIGHT = 170;

/** ใบแจ้งหนี้ / ใบกำกับภาษี (Thai standard layout, prices excl. VAT). */
export function buildTaxInvoicePdf(data: OrderDocumentData, copy: 'original' | 'copy' = 'original'): TDocumentDefinitions {
  const t = data.totals;
  const inv = data.invoice;
  return baseDefinition(`ใบกำกับภาษี ${inv?.invoice_no || data.order_no}`, [
    {
      columns: [
        { width: '*', stack: [sellerBlock(data.seller)] },
        {
          width: 230,
          stack: [
            { text: 'ใบแจ้งหนี้ / ใบกำกับภาษี', fontSize: 15, bold: true, color: COLORS.accent, alignment: 'right' },
            { text: 'Invoice / Tax Invoice', alignment: 'right', color: COLORS.muted, fontSize: 8.5 },
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
                { label: 'เลขที่', value: inv?.invoice_no || '-' },
              { label: 'วันที่', value: dateTh(inv?.issued_at || data.order_date) },
              { label: 'ครบกำหนด', value: dateTh(inv?.due_date || data.due_date) },
              ],
              [
                { label: 'อ้างอิง PO', value: data.customer_po_no || data.order_no },
              { label: 'เครดิต', value: data.credit_label || '-' },
              { label: 'พนักงานขาย', value: data.sales_name || '-' },
              ],
            ]),
          ],
        },
      ],
      columnGap: 14,
    },
    itemsTable(data.items, t, 'excl'),
    totalsBlock(
      t.discount_incl_vat > 0
        ? [
          { label: 'รวมเงิน', value: money(round2(t.goods_ex_vat + t.delivery_fee_ex_vat)) },
          { label: 'หัก ส่วนลด', value: `-${money(t.discount_ex_vat)}` },
          { label: 'ยอดหลังหักส่วนลด', value: money(t.subtotal_ex_vat) },
          { label: 'ภาษีมูลค่าเพิ่ม 7%', value: money(t.vat) },
          { label: 'จำนวนเงินรวมทั้งสิ้น', value: money(t.net_incl_vat), final: true },
        ]
        : [
          { label: 'รวมเงิน', value: money(t.subtotal_ex_vat) },
          { label: 'ภาษีมูลค่าเพิ่ม 7%', value: money(t.vat) },
          { label: 'จำนวนเงินรวมทั้งสิ้น', value: money(t.net_incl_vat), final: true },
        ],
    ),
    { text: `(${thaiBahtText(t.net_incl_vat)})`, bold: true, alignment: 'right', margin: [0, 4, 0, 10] },
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
  ], {
    // หมายเหตุ + ช่องลงนาม ชิดท้ายกระดาษหน้าสุดท้ายเสมอ
    height: PAGE_BOTTOM_HEIGHT,
    build: () => ({
      stack: [
        {
          stack: [
            { text: 'หมายเหตุ', bold: true },
            `1. กรุณาโอนเงินหรือสั่งจ่ายเช็คขีดคร่อมในนาม ${PAYEE_NAME} (เลขที่บัญชี ${PAYEE_BANK_ACCOUNT})`,
            '2. โปรดชำระหนี้ตามเงินที่ระบุภายในระยะเวลาที่กำหนดในเอกสาร ในกรณีชำระเงินเกินกำหนดต้องเสียดอกเบี้ยร้อยละ 15 ต่อปี นับจากวันที่ผิดนัดชำระเป็นต้นไป',
          ],
          fontSize: 8.5,
          margin: [0, 8, 0, 0],
        },
        signatureBoxes([
          'ผู้รับเอกสาร / Received by',
          { label: 'ผู้ออกเอกสาร / Issued by', name: data.sales_name, image: data.sales_signature, date: dateTh(inv?.issued_at || data.order_date) },
        ]),
      ],
    }),
  });
}
