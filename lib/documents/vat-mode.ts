import type { DocumentType } from '@/lib/documents/types';

/**
 * How prices are shown on a priced document:
 * - `excl` ราคาไม่รวมภาษี: unit prices/amounts before VAT, VAT added at the bottom (default)
 * - `incl` ราคารวมภาษี: unit prices/amounts including VAT, VAT broken out at the bottom
 */
export type VatMode = 'excl' | 'incl';

export const DEFAULT_VAT_MODE: VatMode = 'excl';

/** Thai labels for the VAT mode selector. */
export const VAT_MODE_OPTIONS: Array<{ value: VatMode; label: string }> = [
  { value: 'excl', label: 'ราคาไม่รวมภาษี' },
  { value: 'incl', label: 'ราคารวมภาษี' },
];

/** Document types whose item table shows prices and therefore honour the VAT mode. */
export const VAT_MODE_DOCUMENT_TYPES: DocumentType[] = ['purchase-order', 'quotation', 'tax-invoice'];

/**
 * Whether a document type supports choosing the VAT display mode.
 * @param type - document type
 */
export function supportsVatMode(type: DocumentType): boolean {
  return VAT_MODE_DOCUMENT_TYPES.includes(type);
}

/**
 * Parses an optional VAT mode: only `excl` / `incl` count, anything else
 * (missing, typo) is undefined so the caller falls back to the bill's mode.
 * @param value - raw value
 */
export function parseOptionalVatMode(value: unknown): VatMode | undefined {
  return value === 'incl' || value === 'excl' ? value : undefined;
}

/**
 * Parses a VAT mode from untrusted input (query string / JSON body).
 * Anything other than `incl` falls back to the default (`excl`).
 * @param value - raw value
 */
export function parseVatMode(value: unknown): VatMode {
  return value === 'incl' ? 'incl' : DEFAULT_VAT_MODE;
}
