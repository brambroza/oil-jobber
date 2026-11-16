import { createHash, randomBytes } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase/server';
import { findCustomerLineRecipient } from '@/lib/services/documents';
import { logOutboundLineMessages, pushLinePayload } from '@/lib/services/line';
import { money } from '@/lib/documents/format';
import { formatDate } from '@/lib/utils/date-format';
import {
  buildPaymentLinkUrl,
  isPlausibleLinkToken,
  paymentLinkExpiry,
  resolvePaymentLinkState,
  type PaymentLinkState,
  type SlipStatus,
} from '@/lib/utils/payment-slip';

export const SLIP_BUCKET = 'payment-slips';

/**
 * SHA-256 hex of a raw link token. Only the hash is stored in the DB.
 * @param token raw token from the URL
 * @returns hex digest
 */
export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Site origin for public links: NEXT_PUBLIC_SITE_URL when set, otherwise the request origin.
 * @param requestOrigin origin of the current request
 * @returns origin without trailing slash
 */
export function resolveSiteOrigin(requestOrigin: string): string {
  const configured = (process.env.NEXT_PUBLIC_SITE_URL || '').trim();
  return (configured || requestOrigin).replace(/\/+$/, '');
}

/** Outstanding balance of an order via the existing DB function. */
export async function loadOrderOutstanding(orderId: string): Promise<number> {
  const { data } = await supabaseAdmin.rpc('get_order_outstanding_amount', { p_order: orderId });
  return Number(data || 0);
}

/**
 * Creates a new slip link for an order and revokes the order's older active links,
 * so only the most recently sent link works.
 * @returns raw token, URL and expiry (the raw token is never stored)
 */
export async function createPaymentLink(companyId: string, orderId: string, userId: string, origin: string): Promise<
  { id: string; url: string; expires_at: string } | { error: string; status: number }
> {
  const { data: order } = await supabaseAdmin
    .from('sale_orders')
    .select('id, order_status')
    .eq('id', orderId)
    .eq('company_id', companyId)
    .eq('is_deleted', false)
    .maybeSingle();
  if (!order) return { error: 'ไม่พบคำสั่งซื้อ', status: 404 };
  if (['DRAFT', 'CANCELLED'].includes(String(order.order_status))) return { error: 'สถานะคำสั่งซื้อไม่สามารถรับชำระได้', status: 422 };
  if ((await loadOrderOutstanding(orderId)) <= 0.005) return { error: 'บิลนี้ชำระครบแล้ว', status: 422 };

  const nowIso = new Date().toISOString();
  await supabaseAdmin
    .from('payment_slip_links')
    .update({ revoked_at: nowIso })
    .eq('company_id', companyId)
    .eq('sale_order_id', orderId)
    .is('revoked_at', null);

  const token = randomBytes(24).toString('base64url');
  const expiresAt = paymentLinkExpiry(new Date()).toISOString();
  const { data, error } = await supabaseAdmin
    .from('payment_slip_links')
    .insert({ company_id: companyId, sale_order_id: orderId, token_hash: hashLinkToken(token), expires_at: expiresAt, created_by: userId })
    .select('id, expires_at')
    .single();
  if (error || !data) return { error: error?.message || 'สร้างลิงก์ไม่สำเร็จ', status: 400 };
  return { id: data.id, url: buildPaymentLinkUrl(origin, token), expires_at: data.expires_at };
}

export type PublicPaymentView = {
  state: PaymentLinkState;
  company_name: string;
  order_no: string | null;
  invoice_no: string | null;
  customer_name: string | null;
  total_amount: number;
  paid_amount: number;
  outstanding: number;
  expires_at: string;
  submissions: Array<{ id: string; created_at: string; amount: number; transferred_at: string; status: SlipStatus; reject_reason: string | null }>;
};

type LinkRow = { id: string; company_id: string; sale_order_id: string; expires_at: string; revoked_at: string | null };

/**
 * Looks up a link by its raw token.
 * @returns link row or null when the token is malformed or unknown
 */
export async function findLinkByToken(token: string): Promise<LinkRow | null> {
  if (!isPlausibleLinkToken(token)) return null;
  const { data } = await supabaseAdmin
    .from('payment_slip_links')
    .select('id, company_id, sale_order_id, expires_at, revoked_at')
    .eq('token_hash', hashLinkToken(token))
    .maybeSingle();
  return (data as LinkRow | null) ?? null;
}

/**
 * Builds the minimal order summary shown on the public slip page plus the link state.
 * Exposes only bill numbers, customer name, amounts and this order's slip statuses.
 */
export async function loadPublicPaymentView(link: LinkRow): Promise<PublicPaymentView> {
  const [orderRes, companyRes, invoiceRes, subsRes, outstanding] = await Promise.all([
    supabaseAdmin.from('sale_orders').select('order_no, order_status, total_amount, customer_id, is_deleted').eq('id', link.sale_order_id).maybeSingle(),
    supabaseAdmin.from('companies').select('name').eq('id', link.company_id).maybeSingle(),
    supabaseAdmin.from('invoices').select('invoice_no').eq('sale_order_id', link.sale_order_id).eq('is_deleted', false)
      .neq('status', 'CANCELLED').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from('payment_slip_submissions').select('id, created_at, amount, transferred_at, status, reject_reason')
      .eq('sale_order_id', link.sale_order_id).order('created_at', { ascending: false }).limit(20),
    loadOrderOutstanding(link.sale_order_id),
  ]);
  const order = orderRes.data;
  let customerName: string | null = null;
  if (order?.customer_id) {
    const { data: customer } = await supabaseAdmin.from('customers').select('company_name').eq('id', order.customer_id).maybeSingle();
    customerName = customer?.company_name ?? null;
  }
  const total = Number(order?.total_amount || 0);
  return {
    state: resolvePaymentLinkState({
      expiresAt: link.expires_at,
      revokedAt: link.revoked_at,
      outstanding,
      orderStatus: order && !order.is_deleted ? String(order.order_status) : null,
    }),
    company_name: companyRes.data?.name || '',
    order_no: order?.order_no ?? null,
    invoice_no: invoiceRes.data?.invoice_no ?? null,
    customer_name: customerName,
    total_amount: total,
    paid_amount: Math.max(0, Math.round((total - outstanding) * 100) / 100),
    outstanding,
    expires_at: link.expires_at,
    submissions: (subsRes.data ?? []).map((s) => ({ ...s, amount: Number(s.amount), status: s.status as SlipStatus })),
  };
}

/**
 * Pushes the slip link to the customer's LINE (group when linked, otherwise user).
 * @returns recipient type, or an error when the customer has not linked LINE
 */
export async function sendPaymentLinkToLine(companyId: string, linkId: string, url: string): Promise<
  { recipient: 'GROUP' | 'USER' } | { error: string; status: number }
> {
  const { data: link } = await supabaseAdmin
    .from('payment_slip_links')
    .select('id, sale_order_id, expires_at')
    .eq('id', linkId)
    .eq('company_id', companyId)
    .maybeSingle();
  if (!link) return { error: 'ไม่พบลิงก์', status: 404 };
  const { data: order } = await supabaseAdmin.from('sale_orders').select('order_no, customer_id').eq('id', link.sale_order_id).maybeSingle();
  if (!order?.customer_id) return { error: 'ไม่พบลูกค้าของคำสั่งซื้อนี้', status: 404 };

  const lineCustomer = await findCustomerLineRecipient(companyId, order.customer_id);
  const recipient = lineCustomer?.group_id || lineCustomer?.line_user_id;
  if (!recipient) return { error: 'ลูกค้ารายนี้ยังไม่ได้เชื่อม LINE', status: 422 };

  const outstanding = await loadOrderOutstanding(link.sale_order_id);
  const orderLabel = order.order_no || link.sale_order_id.slice(0, 8);
  const message = {
    type: 'flex',
    altText: `แนบสลิปการชำระเงิน ${orderLabel}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: '#716ab0', paddingAll: '14px',
        contents: [
          { type: 'text', text: 'แนบสลิปการชำระเงิน', color: '#ffffff', weight: 'bold', size: 'md' },
          { type: 'text', text: orderLabel, color: '#e9e7f7', size: 'sm' },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'text', text: `ยอดคงค้าง ${money(outstanding)} บาท`, weight: 'bold', wrap: true },
          { type: 'text', text: 'โอนแล้วกดปุ่มด้านล่างเพื่ออัปโหลดสลิป เจ้าหน้าที่จะตรวจสอบและออกใบเสร็จให้', size: 'sm', color: '#5b5f73', wrap: true },
          { type: 'text', text: `ลิงก์ใช้ได้ถึง ${formatDate(link.expires_at)}`, size: 'xs', color: '#94a3b8', wrap: true },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical',
        contents: [{ type: 'button', style: 'primary', color: '#716ab0', action: { type: 'uri', label: 'แนบสลิปโอนเงิน', uri: url } }],
      },
    },
  };
  await pushLinePayload(recipient, [message], {
    companyId,
    lineCustomerId: lineCustomer?.id ?? null,
    recipientType: lineCustomer?.group_id ? 'GROUP' : 'USER',
    source: 'payment_slip_link',
  });
  await logOutboundLineMessages([{
    company_id: companyId,
    line_customer_id: lineCustomer?.id ?? null,
    group_id: lineCustomer?.group_id || null,
    message_type: 'payment_slip_link',
    message_text: `ลิงก์แนบสลิป ${orderLabel}: ${url}`,
    message_payload: message,
  }]);
  await supabaseAdmin.from('payment_slip_links').update({ sent_line_at: new Date().toISOString() }).eq('id', linkId);
  return { recipient: lineCustomer?.group_id ? 'GROUP' : 'USER' };
}

/**
 * Short-lived signed URL for staff to view a private slip file.
 * @param filePath path inside the payment-slips bucket
 * @returns signed URL or null
 */
export async function signedSlipUrl(filePath: string, expiresInSeconds = 300): Promise<string | null> {
  const { data } = await supabaseAdmin.storage.from(SLIP_BUCKET).createSignedUrl(filePath, expiresInSeconds);
  return data?.signedUrl ?? null;
}
