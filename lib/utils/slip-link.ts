/** Prefix of slip files uploaded by customers (private `payment-slips` bucket). */
export const STORED_SLIP_PREFIX = 'payment-slips/';

/**
 * True when the value is an absolute http(s) URL (e.g. a Google Drive link).
 * Rejects javascript:, data: and other schemes so the link is safe to render.
 * @param value raw text
 * @returns whether it is a safe external link
 */
export function isHttpUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/**
 * Classifies a stored `payment_transactions.slip_url`.
 * @param value stored value
 * @returns external link, path in the private slip bucket, or none
 */
export function classifySlipUrl(value: string | null | undefined):
  | { kind: 'external'; url: string }
  | { kind: 'stored'; path: string }
  | { kind: 'none' } {
  const text = String(value || '').trim();
  if (text.startsWith(STORED_SLIP_PREFIX)) return { kind: 'stored', path: text.slice(STORED_SLIP_PREFIX.length) };
  if (isHttpUrl(text)) return { kind: 'external', url: text };
  return { kind: 'none' };
}
