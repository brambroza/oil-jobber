import type { TDocumentDefinitions, TableCell } from 'pdfmake/interfaces';
import { baseDefinition, customerBlock, metaGrid, sellerBlock, signatures, totalsBlock, COLORS } from '@/lib/documents/pdf';
import { dateTh, money, paymentMethodThai } from '@/lib/documents/format';
import { thaiBahtText } from '@/lib/utils/thai-baht-text';
import type { ReceiptDocumentData } from '@/lib/documents/types';

/** ใบเสร็จรับเงิน for one payment, with the order's payment history. */
export function buildReceiptPdf(data: ReceiptDocumentData): TDocumentDefinitions {
  const header = (text: string, alignment: 'left' | 'right' = 'left'): TableCell => ({ text, bold: true, fillColor: COLORS.accentSoft, color: '#4e4a78', alignment, margin: [4, 4, 4, 4] });
  const historyBody: TableCell[][] = [[header('วันที่'), header('เลขที่ใบเสร็จ'), header('วิธีชำระ'), header('เลขอ้างอิง'), header('จำนวนเงิน', 'right')]];
  for (const p of data.payments) {
    const current = p.receipt_no === data.receipt.receipt_no;
    historyBody.push([
      { text: dateTh(p.paid_at), bold: current, margin: [4, 3, 4, 3] },
      { text: p.receipt_no || '-', bold: current, margin: [4, 3, 4, 3] },
      { text: paymentMethodThai(p.payment_method), bold: current, margin: [4, 3, 4, 3] },
      { text: p.reference_no || '-', bold: current, margin: [4, 3, 4, 3] },
      { text: money(p.amount), alignment: 'right', bold: current, margin: [4, 3, 4, 3] },
    ]);
  }

  return baseDefinition(`ใบเสร็จรับเงิน ${data.receipt.receipt_no}`, [
    {
      columns: [
        { width: '*', stack: [sellerBlock(data.seller)] },
        { width: 200, stack: [{ text: 'ใบเสร็จรับเงิน', fontSize: 17, bold: true, color: COLORS.accent, alignment: 'right' }, { text: 'Receipt', alignment: 'right', color: COLORS.muted }] },
      ],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 6, x2: 523, y2: 6, lineWidth: 0.6, lineColor: COLORS.line }], margin: [0, 0, 0, 8] },
    {
      columns: [
        { width: '*', stack: [customerBlock(data.customer, 'ได้รับเงินจาก')] },
        {
          width: 270,
          stack: [
            metaGrid([
              [
                { label: 'เลขที่', value: data.receipt.receipt_no },
              { label: 'วันที่', value: dateTh(data.receipt.issued_at) },
              { label: 'อ้างอิง', value: data.invoice?.invoice_no || data.order_no },
              ],
              [
                { label: 'วิธีชำระ', value: paymentMethodThai(data.receipt.payment_method) },
              { label: 'เลขอ้างอิง', value: data.receipt.reference_no || '-' },
              { label: 'พนักงานขาย', value: data.sales_name || '-' },
              ],
            ]),
          ],
        },
      ],
      columnGap: 14,
    },
    {
      table: {
        widths: ['*', 110],
        body: [
          [header('รายการ'), header('จำนวนเงิน', 'right')],
          [{ text: `ชำระค่าสินค้าตามคำสั่งซื้อ ${data.order_no}${data.invoice ? ` / ใบกำกับภาษี ${data.invoice.invoice_no}` : ''}`, margin: [4, 4, 4, 4] }, { text: money(data.receipt.amount), alignment: 'right', margin: [4, 4, 4, 4] }],
        ],
      },
      layout: { hLineWidth: () => 0.5, vLineWidth: () => 0, hLineColor: () => COLORS.line },
      margin: [0, 10, 0, 6],
    },
    totalsBlock([
      { label: 'ยอดบิลรวม', value: money(data.totals.net_incl_vat) },
      { label: 'รับชำระครั้งนี้', value: money(data.receipt.amount), final: true },
      { label: 'ชำระแล้วทั้งหมด', value: money(data.paid_amount) },
      { label: 'คงค้าง', value: money(data.outstanding_amount) },
    ]),
    { text: `(${thaiBahtText(data.receipt.amount)})`, bold: true, alignment: 'right', margin: [0, 4, 0, 12] },
    { text: 'ประวัติการรับชำระของบิลนี้', bold: true, margin: [0, 4, 0, 4] },
    {
      table: { headerRows: 1, widths: [70, 90, 70, '*', 90], body: historyBody },
      layout: { hLineWidth: () => 0.4, vLineWidth: () => 0, hLineColor: () => COLORS.line },
    },
    signatures(['ผู้ชำระเงิน', { label: 'ผู้รับเงิน', image: data.receiver_signature, date: dateTh(data.receipt.issued_at) }]),
  ]);
}
