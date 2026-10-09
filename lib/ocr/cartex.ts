/**
 * Parser for SFL / Cartex price broadcast text (usually a LINE message screenshot run
 * through Typhoon OCR). Example input (one depot per line, prices joined by `_`):
 *
 *   SFL.. Price=ULG/G95/G91/E20/B7/B20-
 *   SRB=45.09_35.84_35.61_30.65_37.66_32.75-
 *   LLK=44.98_35.75_35.54_30.60_37.59_32.67-
 *   Eff. Oct 09, 2026**12:35 hrs...SFL.-
 *
 * The OCR output is noisy, so this module tolerates: `*` bold markers, prices split by
 * whitespace, a depot code split by whitespace or a stray `=` (e.g. `KKAE=N=`), and a
 * footer written as `-Eff`, `- _Eff.` or `Eff_Oct`.
 */

/** One depot's prices keyed by product code (e.g. `{ G95: 35.84 }`). */
export type ParsedDepotPrice = {
  depotCode: string;
  depotName?: string;
  prices: Record<string, number>;
};

/** Default product order when the `Price=` header is missing from the OCR text. */
const DEFAULT_CARTEX_PRODUCTS = 'ULG/G95/G91/E20/B7/B20';

/**
 * Collapses whitespace and strips markdown bold markers (`*`) that OCR adds around text.
 * @param raw OCR text as returned by Typhoon
 * @returns single-line, trimmed text
 */
export function cleanRaw(raw: string): string {
  return raw.replace(/\r/g, '').replace(/\s+/g, ' ').replace(/\*+/g, '').trim();
}

/**
 * Splits a `Price=ULG/G95/...` header value into product codes.
 * @param value header capture group, may be empty
 */
function parseProducts(value: string): string[] {
  return (value || DEFAULT_CARTEX_PRODUCTS)
    .replace(/\s+/g, '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Converts a `_`-joined price list into numbers, repairing common OCR splits first.
 * @param value e.g. `45.09_35.84_3 2.67`
 */
function parseNumbers(value: string): number[] {
  return value
    .replace(/(\d)\s+\.(\d+)/g, '$1.$2')
    // OCR sometimes splits one decimal with an underscore, e.g. 31.4_2 => 31.42.
    .replace(/(\d+\.\d)_([0-9])(?=_|\s|$)/g, '$1$2')
    // OCR can split a two-digit price after a separator, e.g. _2 8.63 => _28.63.
    .replace(/_([0-9])\s+([0-9]\.[0-9]+)/g, '_$1$2')
    .replace(/(\d+\.\d)\s+([0-9])(?=\s|$)/g, '$1$2')
    .replace(/\b(\d)\s+(\d\.\d+)/g, '$1$2')
    .replace(/_/g, ' ')
    .trim()
    .split(/\s+/)
    .map((n) => Number(n || 0));
}

/**
 * Drops the `Eff. <date> ... SFL.-` footer that follows the last depot in a block.
 * Accepts `-Eff`, `- _Eff.` and `Eff_Oct` spellings produced by OCR.
 * @param block text between two `Price=` headers
 */
function stripEffectiveFooter(block: string): string {
  return block.split(/-?\s*_?\bEff\b/i)[0];
}

/**
 * Parses a Cartex/SFL price message into one entry per depot. When the same depot code
 * appears twice the later value wins.
 * @param raw OCR text (multi-line allowed)
 * @returns depot price rows; empty when nothing matched
 */
export function parseCartex(raw: string): ParsedDepotPrice[] {
  const oneLine = cleanRaw(raw)
    .replace(/\bS20\b/g, 'B20')
    // Depot code split by whitespace, e.g. `S RB=` => `SRB=`.
    .replace(/\b([A-Z])\s+([A-Z]{2,11})\s*=/g, '$1$2=')
    // Depot code split by a stray `=`, e.g. `KKAE=N=` => `KKAEN=`.
    .replace(/\b([A-Z]{2,11})\s*=\s*([A-Z])\s*=/g, '$1$2=')
    // Dash between two digits is a line-wrap artefact, not a separator.
    .replace(/(\d)\s*-\s*(?=\d)/g, '$1 ');

  const headerRegex = /Price\s*=\s*([A-Z0-9/ ]+)-/gi;
  const headers = [...oneLine.matchAll(headerRegex)];
  const resultByDepot = new Map<string, ParsedDepotPrice>();

  const parseBlock = (products: string[], block: string) => {
    // Depot code, `=`, then a price run starting with a digit (or `_` when OCR drops the first price). The run ends at the next
    // dash, the next `CODE=` token, or the end of the block.
    const regex = /-?\s*([A-Z]{2,12})\s*=\s*([0-9_][0-9._ ]*?)(?=\s*-|\s+[A-Z]{2,12}\s*=|\s*$)/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(block)) !== null) {
      const depotCode = match[1].trim().toUpperCase();
      const nums = parseNumbers(match[2]);
      const prices: Record<string, number> = {};
      products.forEach((p, idx) => {
        prices[p] = nums[idx] ?? 0;
      });
      resultByDepot.set(depotCode, { depotCode, prices });
    }
  };

  if (headers.length) {
    headers.forEach((header, idx) => {
      const products = parseProducts(header[1]);
      const blockStart = (header.index ?? 0) + header[0].length;
      const blockEnd = idx + 1 < headers.length ? headers[idx + 1].index ?? oneLine.length : oneLine.length;
      parseBlock(products, stripEffectiveFooter(oneLine.slice(blockStart, blockEnd)));
    });
  } else {
    parseBlock(parseProducts(''), stripEffectiveFooter(oneLine));
  }

  return [...resultByDepot.values()];
}
