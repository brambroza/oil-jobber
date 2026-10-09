import { supabaseAdmin } from '@/lib/supabase/server';
import { renderPdf } from '@/lib/documents/pdf';
import { loadOrderDocumentData, loadReceiptDocumentData } from '@/lib/documents/from-order';
import { buildPurchaseOrderPdf } from '@/lib/documents/purchase-order';
import { buildTaxInvoicePdf } from '@/lib/documents/tax-invoice';
import { buildReceiptPdf } from '@/lib/documents/receipt';
import { money } from '@/lib/documents/format';
import { pushLinePayload, type LinePushContext } from '@/lib/services/line';
import type { DocumentType } from '@/lib/documents/types';

export const DOCUMENT_TYPES: DocumentType[] = ['purchase-order', 'tax-invoice', 'receipt'];

export const DOCUMENT_TITLES: Record<DocumentType, string> = {
  'purchase-order': 'ใบสั่งซื้อ',
  'tax-invoice': 'ใบส่งของ/ใบแจ้งหนี้/ใบกำกับภาษี',
  receipt: 'ใบเสร็จรับเงิน',
};

export type GeneratedDocument = {
  buffer: Buffer;
  filename: string;
  title: string;
  docNo: string;
  orderId: string;
  customerId: string | null;
  summary: string;
};

/**
 * Generates one PDF document. `id` is an order id for purchase-order /
 * tax-invoice and a receipt id for receipt.
 */
export async function generateDocumentPdf(
  companyId: string,
  type: DocumentType,
  id: string,
  options: { copy?: boolean } = {},
): Promise<GeneratedDocument | { error: string; status: number }> {
  if (type === 'receipt') {
    const data = await loadReceiptDocumentData(companyId, id);
    if ('error' in data) return data;
    const buffer = await renderPdf(buildReceiptPdf(data));
    const { data: customerRow } = await supabaseAdmin.from('sale_orders').select('customer_id').eq('id', data.order_id).maybeSingle();
    return {
      buffer,
      filename: `${data.receipt.receipt_no}.pdf`,
      title: DOCUMENT_TITLES.receipt,
      docNo: data.receipt.receipt_no,
      orderId: data.order_id,
      customerId: customerRow?.customer_id ?? null,
      summary: `รับชำระ ${money(data.receipt.amount)} บาท คงค้าง ${money(data.outstanding_amount)} บาท`,
    };
  }

  const data = await loadOrderDocumentData(companyId, id);
  if ('error' in data) return data;
  const { data: customerRow } = await supabaseAdmin.from('sale_orders').select('customer_id').eq('id', id).maybeSingle();

  if (type === 'tax-invoice') {
    if (!data.invoice) return { error: 'ยังไม่ได้ออกใบกำกับภาษีสำหรับคำสั่งซื้อนี้', status: 409 };
    const buffer = await renderPdf(buildTaxInvoicePdf(data, options.copy ? 'copy' : 'original'));
    return {
      buffer,
      filename: `${data.invoice.invoice_no}.pdf`,
      title: DOCUMENT_TITLES['tax-invoice'],
      docNo: data.invoice.invoice_no,
      orderId: data.order_id,
      customerId: customerRow?.customer_id ?? null,
      summary: `ยอดรวม ${money(data.totals.net_incl_vat)} บาท ครบกำหนด ${data.invoice.due_date || data.due_date || '-'}`,
    };
  }

  const buffer = await renderPdf(buildPurchaseOrderPdf(data));
  return {
    buffer,
    filename: `${data.order_no}.pdf`,
    title: DOCUMENT_TITLES['purchase-order'],
    docNo: data.order_no,
    orderId: data.order_id,
    customerId: customerRow?.customer_id ?? null,
    summary: `${money(data.totals.total_liters, 0)} ลิตร ยอดรวม ${money(data.totals.net_incl_vat)} บาท`,
  };
}

/** Uploads a generated PDF to the public `documents` bucket and returns its URL. */
export async function uploadDocumentPdf(companyId: string, doc: GeneratedDocument, type: DocumentType): Promise<{ url: string; path: string } | { error: string }> {
  const path = `${companyId}/${type}/${doc.orderId}/${Date.now()}-${doc.filename}`;
  const { error } = await supabaseAdmin.storage.from('documents').upload(path, doc.buffer, { contentType: 'application/pdf', upsert: false });
  if (error) return { error: error.message };
  const { data } = supabaseAdmin.storage.from('documents').getPublicUrl(path);
  return { url: data.publicUrl, path };
}

/** LINE flex bubble with a button that opens the PDF. */
export function buildDocumentFlex(doc: GeneratedDocument, url: string, customerName: string) {
  return {
    type: 'flex',
    altText: `${doc.title} ${doc.docNo} (PDF)`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: '#716ab0',
        paddingAll: '14px',
        contents: [
          { type: 'text', text: doc.title, color: '#ffffff', weight: 'bold', size: 'md', wrap: true },
          { type: 'text', text: doc.docNo, color: '#e9e7f7', size: 'sm' },
        ],
      },
      body: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        contents: [
          { type: 'text', text: customerName, weight: 'bold', wrap: true },
          { type: 'text', text: doc.summary, size: 'sm', color: '#5b5f73', wrap: true },
          { type: 'text', text: 'กดปุ่มด้านล่างเพื่อเปิดไฟล์ PDF', size: 'xs', color: '#94a3b8', wrap: true },
        ],
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'button', style: 'primary', color: '#716ab0', action: { type: 'uri', label: 'เปิดไฟล์ PDF', uri: url } },
        ],
      },
    },
  };
}

/**
 * Generates, uploads and pushes a document to the customer's LINE (group when
 * linked, otherwise the user). Returns the public URL.
 */
export async function sendDocumentToLine(
  companyId: string,
  type: DocumentType,
  id: string,
): Promise<{ url: string; recipient: string; docNo: string } | { error: string; status: number }> {
  const doc = await generateDocumentPdf(companyId, type, id);
  if ('error' in doc) return doc;
  if (!doc.customerId) return { error: 'ไม่พบลูกค้าของเอกสารนี้', status: 404 };

  const { data: lineCustomer } = await supabaseAdmin
    .from('line_customers')
    .select('id, line_user_id, group_id')
    .eq('company_id', companyId)
    .eq('customer_id', doc.customerId)
    .eq('is_deleted', false)
    .order('group_id', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  const recipient = lineCustomer?.group_id || lineCustomer?.line_user_id;
  if (!recipient) return { error: 'ลูกค้ารายนี้ยังไม่ได้เชื่อม LINE', status: 422 };

  const uploaded = await uploadDocumentPdf(companyId, doc, type);
  if ('error' in uploaded) return { error: uploaded.error, status: 400 };

  const { data: customer } = await supabaseAdmin.from('customers').select('company_name').eq('id', doc.customerId).maybeSingle();
  const context: LinePushContext = {
    companyId,
    lineCustomerId: lineCustomer?.id ?? null,
    recipientType: lineCustomer?.group_id ? 'GROUP' : 'USER',
    source: `document_${type}`,
  };
  await pushLinePayload(recipient, [buildDocumentFlex(doc, uploaded.url, customer?.company_name || '')], context);

  await supabaseAdmin.from('line_messages').insert({
    company_id: companyId,
    line_customer_id: lineCustomer?.id ?? null,
    group_id: lineCustomer?.group_id || null,
    direction: 'OUT',
    message_type: `document_${type}`,
    message_text: `${doc.title} ${doc.docNo}: ${uploaded.url}`,
  });

  return { url: uploaded.url, recipient: lineCustomer?.group_id ? 'GROUP' : 'USER', docNo: doc.docNo };
}
