/**
 * Pure helpers for the customer pay-in slip link (no DB / Node APIs so they
 * can be unit tested and shared by server and client code).
 */

/** Link lifetime: 7 days, or until the order is fully paid. */
export const PAYMENT_LINK_TTL_DAYS = 7;
/** Max slip file size accepted from customers (bytes). Matches the bucket limit. */
export const SLIP_MAX_BYTES = 5 * 1024 * 1024;
/** Mime types accepted for a slip. HEIC is converted to JPEG in the browser first. */
export const SLIP_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'] as const;
/** Max PENDING slips per link, to stop a leaked link from flooding the review queue. */
export const SLIP_MAX_PENDING_PER_LINK = 5;

export type PaymentLinkState = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'PAID' | 'CLOSED';

export type SlipStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export const SLIP_STATUS_LABELS: Record<SlipStatus, string> = {
  PENDING: 'รอตรวจสอบ',
  APPROVED: 'ยืนยันแล้ว',
  REJECTED: 'ไม่อนุมัติ',
};

export const LINK_STATE_MESSAGES: Record<Exclude<PaymentLinkState, 'ACTIVE'>, string> = {
  EXPIRED: 'ลิงก์นี้หมดอายุแล้ว กรุณาติดต่อเจ้าหน้าที่เพื่อขอลิงก์ใหม่',
  REVOKED: 'ลิงก์นี้ถูกยกเลิกแล้ว กรุณาใช้ลิงก์ล่าสุดที่ได้รับ',
  PAID: 'บิลนี้ชำระครบแล้ว ขอบคุณค่ะ',
  CLOSED: 'บิลนี้ไม่สามารถรับชำระได้ กรุณาติดต่อเจ้าหน้าที่',
};

/**
 * Expiry timestamp for a link created at `from`.
 * @param from creation time
 * @param days lifetime in days
 * @returns expiry Date
 */
export function paymentLinkExpiry(from: Date, days: number = PAYMENT_LINK_TTL_DAYS): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Decides whether a link can still accept slips.
 * Order: revoked > order closed > fully paid > expired.
 * @param input link + order facts
 * @returns link state
 */
export function resolvePaymentLinkState(input: {
  expiresAt: string | Date;
  revokedAt: string | Date | null;
  outstanding: number;
  orderStatus: string | null;
  now?: Date;
}): PaymentLinkState {
  const now = input.now ?? new Date();
  if (input.revokedAt) return 'REVOKED';
  if (!input.orderStatus || ['DRAFT', 'CANCELLED'].includes(input.orderStatus)) return 'CLOSED';
  if (!(input.outstanding > 0.005)) return 'PAID';
  if (new Date(input.expiresAt).getTime() <= now.getTime()) return 'EXPIRED';
  return 'ACTIVE';
}

/**
 * Validates an uploaded slip file's type and size.
 * @param mime file mime type
 * @param bytes file size
 * @returns Thai error message, or null when valid
 */
export function validateSlipFile(mime: string, bytes: number): string | null {
  if (!(SLIP_ALLOWED_MIME as readonly string[]).includes(mime)) return 'รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP) หรือ PDF';
  if (!(bytes > 0)) return 'ไฟล์ว่างเปล่า';
  if (bytes > SLIP_MAX_BYTES) return 'ไฟล์ใหญ่เกิน 5 MB';
  return null;
}

/**
 * File extension used when storing a slip of the given mime type.
 * @param mime allowed slip mime type
 * @returns extension without dot
 */
export function slipExtension(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Default amount to approve: the customer's figure capped at the outstanding balance.
 * @param submitted amount the customer entered
 * @param outstanding current outstanding balance
 * @returns amount rounded to 2 decimals
 */
export function defaultApproveAmount(submitted: number, outstanding: number): number {
  const value = Math.min(Number(submitted || 0), Math.max(0, Number(outstanding || 0)));
  return Math.round(value * 100) / 100;
}

/**
 * Builds the public URL of a slip link.
 * @param origin site origin, e.g. https://app.example.com (trailing slash ok)
 * @param token raw link token
 * @returns absolute URL
 */
export function buildPaymentLinkUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/pay/${encodeURIComponent(token)}`;
}

/**
 * Cheap shape check on a raw token before hitting the DB (base64url, 32 chars).
 * @param token value from the URL
 * @returns true when it looks like a token we issued
 */
export function isPlausibleLinkToken(token: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(token);
}

/**
 * Detects the real slip type from the file's first bytes, so a renamed file
 * cannot pass as an image just by its declared mime type.
 * @param head first 12+ bytes of the file
 * @returns allowed mime type, or null when the content is not one we accept
 */
export function sniffSlipMime(head: Uint8Array): (typeof SLIP_ALLOWED_MIME)[number] | null {
  const at = (i: number) => head[i];
  if (head.length >= 3 && at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return 'image/jpeg';
  if (head.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((b, i) => at(i) === b)) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...Array.from(head.slice(from, to)));
  if (head.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (head.length >= 5 && ascii(0, 5) === '%PDF-') return 'application/pdf';
  return null;
}
