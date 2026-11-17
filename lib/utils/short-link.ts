/** Random bytes per document short code: 8 bytes = 11 base64url chars (64 bits). */
export const SHORT_CODE_BYTES = 8;

/**
 * Cheap shape check on a short code before hitting the DB.
 * @param code value from the URL
 * @returns true when it looks like a code we issued
 */
export function isPlausibleShortCode(code: string): boolean {
  return /^[A-Za-z0-9_-]{11}$/.test(code);
}

/**
 * Builds the public short URL of a document.
 * @param origin site origin, e.g. https://app.example.com (trailing slash ok)
 * @param code short code
 * @returns absolute URL
 */
export function buildDocumentShortUrl(origin: string, code: string): string {
  return `${origin.replace(/\/+$/, '')}/d/${encodeURIComponent(code)}`;
}
