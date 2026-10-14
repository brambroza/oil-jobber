import fs from 'node:fs';
import path from 'node:path';
import PdfPrinter from 'pdfmake';
import type { TDocumentDefinitions, Content, TableCell } from 'pdfmake/interfaces';
import { money, liters as formatLiters, phoneTh } from '@/lib/documents/format';
import type { DocumentItem, DocumentTotals, SellerInfo, CustomerInfo } from '@/lib/documents/types';
import { formatDateTime } from '@/lib/utils/date-format';

const FONT_DIR = path.join(process.cwd(), 'lib', 'documents', 'fonts');

let printer: PdfPrinter | null = null;

/** pdfmake printer with the Sarabun family (Thai + Latin) loaded once per process. */
function getPrinter(): PdfPrinter {
  if (printer) return printer;
  const read = (file: string) => fs.readFileSync(path.join(FONT_DIR, file));
  printer = new PdfPrinter({
    Sarabun: {
      normal: read('Sarabun-Regular.ttf'),
      bold: read('Sarabun-Bold.ttf'),
      italics: read('Sarabun-Italic.ttf'),
      bolditalics: read('Sarabun-BoldItalic.ttf'),
    },
  });
  return printer;
}

/** Renders a pdfmake definition to a PDF buffer. */
export function renderPdf(definition: TDocumentDefinitions): Promise<Buffer> {
  const doc = getPrinter().createPdfKitDocument({
    ...definition,
    defaultStyle: { font: 'Sarabun', fontSize: 10, ...(definition.defaultStyle ?? {}) },
  });
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

export const COLORS = {
  accent: '#716ab0',
  accentSoft: '#f0eff7',
  line: '#d9d9e3',
  muted: '#5b5f73',
  text: '#111827',
};

/** Seller header block (left column). */
export function sellerBlock(seller: SellerInfo): Content {
  return {
    stack: [
      { text: `${seller.name}${seller.branch ? ` (${seller.branch})` : ''}`, bold: true, fontSize: 13 },
      seller.address ? { text: seller.address, color: COLORS.muted } : '',
      {
        text: [
          seller.tax_id ? `เลขประจำตัวผู้เสียภาษี ${seller.tax_id}` : '',
          seller.phone ? `   ${phoneTh(seller.phone)}` : '',
          seller.email ? `   ${seller.email}` : '',
        ].join(''),
        color: COLORS.muted,
      },
    ],
  };
}

/** Customer block. */
export function customerBlock(customer: CustomerInfo, title = 'ลูกค้า'): Content {
  return {
    stack: [
      { text: title, color: COLORS.muted, fontSize: 9 },
      { text: customer.name, bold: true, fontSize: 11 },
      customer.address ? { text: customer.address } : '',
      { text: [customer.tax_id ? `เลขประจำตัวผู้เสียภาษี ${customer.tax_id}` : '', customer.phone ? `   ${phoneTh(customer.phone)}` : ''].join('') },
    ],
  };
}

export type MetaCell = { label: string; value: string };

/**
 * Purple meta grid (เลขที่ / วันที่ / ...). Accepts one row or several rows;
 * all rows share the same fixed column widths so the cells line up, and every
 * cell keeps the same height.
 */
export function metaGrid(rows: MetaCell[] | MetaCell[][], totalWidth = 270): Content {
  const grid: MetaCell[][] = Array.isArray(rows[0]) ? (rows as MetaCell[][]) : [rows as MetaCell[]];
  const columns = Math.max(...grid.map((r) => r.length));
  const colWidth = Math.floor(totalWidth / columns);
  const widths = Array.from({ length: columns }, () => colWidth);
  const body: TableCell[][] = grid.map((row) => Array.from({ length: columns }, (_, i): TableCell => {
    const cell = row[i] ?? { label: '', value: '' };
    return {
      stack: [
        { text: cell.label || ' ', fontSize: 7.5, color: '#ffffff', opacity: 0.85, noWrap: true },
        { text: cell.value || '-', bold: true, color: '#ffffff', fontSize: 9.5, lineHeight: 1.1 },
      ],
      fillColor: COLORS.accent,
      margin: [6, 5, 6, 5],
    };
  }));
  return {
    table: { widths, heights: grid.map(() => 36), body },
    layout: {
      hLineWidth: () => 2,
      vLineWidth: () => 2,
      hLineColor: () => '#ffffff',
      vLineColor: () => '#ffffff',
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
  };
}

function headerCell(text: string, alignment: 'left' | 'right' | 'center' = 'left'): TableCell {
  return { text, bold: true, fillColor: COLORS.accentSoft, color: '#4e4a78', alignment, margin: [4, 4, 4, 4] };
}

/**
 * Item table. `mode` picks whether unit prices and amounts are shown
 * VAT-inclusive (purchase order) or VAT-exclusive (tax invoice).
 */
export function itemsTable(items: DocumentItem[], totals: DocumentTotals, mode: 'incl' | 'excl'): Content {
  const excl = mode === 'excl';
  const body: TableCell[][] = [[
    headerCell('#', 'center'),
    headerCell('รายการ'),
    headerCell('จำนวน (ลิตร)', 'right'),
    headerCell(excl ? 'ราคา/ลิตร (ก่อน VAT)' : 'ราคา/ลิตร (รวม VAT)', 'right'),
    headerCell(excl ? 'จำนวนเงิน (ก่อน VAT)' : 'จำนวนเงิน (รวม VAT)', 'right'),
  ]];
  for (const it of items) {
    body.push([
      { text: String(it.no), alignment: 'center', margin: [4, 3, 4, 3] },
      { stack: [{ text: it.product_name, bold: true }, it.depot_label ? { text: it.depot_label, color: COLORS.muted, fontSize: 8.5 } : ''], margin: [4, 3, 4, 3] },
      { text: formatLiters(it.liters), alignment: 'right', margin: [4, 3, 4, 3] },
      { text: money(excl ? it.unit_price_ex_vat : it.unit_price_incl_vat, excl ? 4 : 2), alignment: 'right', margin: [4, 3, 4, 3] },
      { text: money(excl ? it.amount_ex_vat : it.amount_incl_vat), alignment: 'right', margin: [4, 3, 4, 3] },
    ]);
  }
  if (totals.delivery_fee_incl_vat > 0) {
    body.push([
      { text: String(items.length + 1), alignment: 'center', margin: [4, 3, 4, 3] },
      { text: `ค่าขนส่ง ${money(totals.delivery_fee_per_liter)} บาท/ลิตร × ${formatLiters(totals.total_liters)} ลิตร`, margin: [4, 3, 4, 3] },
      { text: formatLiters(totals.total_liters), alignment: 'right', margin: [4, 3, 4, 3] },
      { text: money(excl ? totals.delivery_fee_per_liter / 1.07 : totals.delivery_fee_per_liter, excl ? 4 : 2), alignment: 'right', margin: [4, 3, 4, 3] },
      { text: money(excl ? totals.delivery_fee_ex_vat : totals.delivery_fee_incl_vat), alignment: 'right', margin: [4, 3, 4, 3] },
    ]);
  }
  return {
    table: { headerRows: 1, widths: [22, '*', 70, 90, 95], body },
    layout: {
      hLineWidth: (i: number, node: any) => (i === 0 || i === node.table.body.length ? 0.8 : 0.4),
      vLineWidth: () => 0,
      hLineColor: () => COLORS.line,
    },
    margin: [0, 10, 0, 6],
  };
}

/** Totals block aligned right. `final` row is highlighted. */
export function totalsBlock(rows: Array<{ label: string; value: string; final?: boolean }>): Content {
  return {
    columns: [
      { width: '*', text: '' },
      {
        width: 240,
        table: {
          widths: ['*', 100],
          body: rows.map((row) => [
            { text: row.label, bold: Boolean(row.final), fillColor: row.final ? COLORS.accent : undefined, color: row.final ? '#fff' : COLORS.text, margin: [6, 3, 6, 3] },
            { text: row.value, alignment: 'right', bold: Boolean(row.final), fillColor: row.final ? COLORS.accent : undefined, color: row.final ? '#fff' : COLORS.text, margin: [6, 3, 6, 3] },
          ]),
        },
        layout: 'noBorders',
      },
    ],
  };
}

export type SignatureSlot = string | {
  label: string;
  /** data URI (PNG/JPEG) placed above the line when the signer has one on file */
  image?: string | null;
  /** printed under the label instead of the blank date when the slot is signed */
  date?: string | null;
  /** signer's name printed in parentheses under the label */
  name?: string | null;
};

/**
 * Signature boxes at the bottom. A slot with an image prints the signature
 * (fit 110×34 pt) above its line and the given date; otherwise the box stays
 * blank for a handwritten signature.
 */
export function signatures(slots: SignatureSlot[]): Content {
  return {
    columns: slots.map((slot) => {
      const { label, image = null, date = null, name = null } = typeof slot === 'string' ? { label: slot } : slot;
      const signed = Boolean(image);
      return {
        stack: [
          signed
            ? { image: image as string, fit: [110, 34], alignment: 'center', margin: [0, 0, 0, 2] }
            : { text: ' ', margin: [0, 18, 0, 0] },
          { canvas: [{ type: 'line', x1: 20, y1: 0, x2: 140, y2: 0, lineWidth: 0.6, lineColor: COLORS.text }] },
          { text: label, alignment: 'center', margin: [0, 4, 0, 0] },
          name ? { text: `(${name})`, alignment: 'center', fontSize: 8.5, color: COLORS.muted } : { text: '', fontSize: 1 },
          {
            // A named signer (approver/salesperson on file) gets the document date even without a signature image.
            text: date && (signed || name) ? `วันที่ ${date}` : 'วันที่ ______/______/________',
            alignment: 'center',
            color: COLORS.muted,
            fontSize: 8.5,
          },
        ],
        alignment: 'center',
      };
    }),
    margin: [0, 24, 0, 0],
  };
}

/** Standard A4 page settings shared by all documents. */
export function baseDefinition(title: string, content: Content[]): TDocumentDefinitions {
  return {
    info: { title },
    pageSize: 'A4',
    pageMargins: [36, 36, 36, 44],
    content,
    footer: (currentPage, pageCount) => ({
      columns: [
        { text: `พิมพ์เมื่อ ${formatDateTime(new Date())}`, fontSize: 7.5, color: COLORS.muted },
        { text: `หน้า ${currentPage} / ${pageCount}`, alignment: 'right', fontSize: 7.5, color: COLORS.muted },
      ],
      margin: [36, 14, 36, 0],
    }),
  };
}
