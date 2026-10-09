import { describe, expect, it } from 'vitest';
import { parseCartex } from '@/lib/ocr/cartex';

/** Raw text Typhoon OCR returned for the 2026-10-09 SFL broadcast screenshot. */
const REAL_OCR = [
  'SFL.. Price=ULG/G95/G91/E20/B7/B20-',
  'SRB=45.09_35.84_35.61_30.65_37.66_32.75-',
  'BPI=0.00_0.00_0.00_0.00_0.00_0.00-',
  'LLL=44.98_35.75_35.54_30.60_37.59_32.67-',
  'PICHIT=0.00_0.00_0.00_0.00_0.00_0.00-',
  'LAMP=0.00_0.00_0.00_0.00_0.00_0.00-',
  'KKAE=N=0.00_36.12_35.91_30.73_37.83_33.04-',
  'Eff_Oct 09, 2026 ** 12:35 hrs ... SFL .-',
  'SFL .. Price=ULG/G95/G91/E20/B7/B20-',
  'SPRC=0.00_35.50_35.32_30.31_37.20_32.50-',
  'SRC=44.74_35.84_35.74_30.49_37.41_0.00-',
  'Eff_Oct 09, 2026** 12:35 hrs ... SFL.-',
].join('\n');

/** Same message typed exactly as it appears in the screenshot. */
const IDEAL_TEXT = [
  'SFL.. Price=ULG/G95/G91/E20/B7/B20-',
  'SRB=45.09_35.84_35.61_30.65_37.66_32.75-',
  'BPI=0.00_0.00_0.00_0.00_0.00_0.00-',
  'LLK=44.98_35.75_35.54_30.60_37.59_32.67-',
  'PICHIT=0.00_0.00_0.00_0.00_0.00_0.00-',
  'LAMP=0.00_0.00_0.00_0.00_0.00_0.00-',
  'KKAEN=0.00_36.12_35.91_30.73_37.83_33.04-',
  '_Eff. Oct 09, 2026**12:35 hrs...SFL.-',
  'SFL.. Price=ULG/G95/G91/E20/B7/B20-',
  'SPRC=0.00_35.50_35.32_30.31_37.20_32.50-',
  'SRC=44.74_35.84_35.74_30.49_37.41_0.00-',
  'Eff. Oct 09, 2026**12:35 hrs...SFL.-',
].join('\n');

const byCode = (rows: ReturnType<typeof parseCartex>) =>
  Object.fromEntries(rows.map((row) => [row.depotCode, row.prices]));

describe('parseCartex', () => {
  it('keeps every depot from the real OCR output, including the misread LLL and KKAE=N', () => {
    const rows = byCode(parseCartex(REAL_OCR));
    expect(Object.keys(rows).sort()).toEqual(['BPI', 'KKAEN', 'LAMP', 'LLL', 'PICHIT', 'SPRC', 'SRB', 'SRC']);
    expect(rows.LLL).toEqual({ ULG: 44.98, G95: 35.75, G91: 35.54, E20: 30.6, B7: 37.59, B20: 32.67 });
    expect(rows.KKAEN).toEqual({ ULG: 0, G95: 36.12, G91: 35.91, E20: 30.73, B7: 37.83, B20: 33.04 });
    expect(rows.SRC).toEqual({ ULG: 44.74, G95: 35.84, G91: 35.74, E20: 30.49, B7: 37.41, B20: 0 });
  });

  it('parses the clean message with all 8 depots', () => {
    const rows = byCode(parseCartex(IDEAL_TEXT));
    expect(Object.keys(rows).sort()).toEqual(['BPI', 'KKAEN', 'LAMP', 'LLK', 'PICHIT', 'SPRC', 'SRB', 'SRC']);
    expect(rows.LLK.B20).toBe(32.67);
    expect(rows.SPRC.G95).toBe(35.5);
  });

  it('tolerates the legacy single-line format with -Eff footer', () => {
    const rows = byCode(parseCartex('SFL.. Price=ULG/G95/G91/E20/B7/B20-SRB=45.09_35.84_35.61_30.65_37.66_32.75-LLK=44.98_35.75_35.54_30.60_37.59_32.67-Eff. Oct 09, 2026**12:35 hrs...SFL.-'));
    expect(Object.keys(rows).sort()).toEqual(['LLK', 'SRB']);
    expect(rows.SRB.ULG).toBe(45.09);
  });

  it('repairs prices split by whitespace (_2 8.63, 3 2.67, 31.4_2)', () => {
    const rows = byCode(parseCartex('Price=ULG/G95/G91/B7-SRB=45.09_2 8.63_3 2.67_31.4_2-Eff. Oct 09'));
    expect(rows.SRB).toEqual({ ULG: 45.09, G95: 28.63, G91: 32.67, B7: 31.42 });
  });

  it('maps S20 to B20 and falls back to the default product list without a header', () => {
    const rows = byCode(parseCartex('SRB=1_2_3_4_5_6-Eff. Oct 09'));
    expect(rows.SRB).toEqual({ ULG: 1, G95: 2, G91: 3, E20: 4, B7: 5, B20: 6 });
    const withHeader = byCode(parseCartex('Price=S20-SRB=9.5-Eff.'));
    expect(withHeader.SRB).toEqual({ B20: 9.5 });
  });

  it('returns an empty array for unrelated text', () => {
    expect(parseCartex('ไม่มีข้อมูลราคา')).toEqual([]);
  });
});
