const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/**
 * Reads an integer 0..999999 in Thai words. `hasHigherDigits` is true when a
 * higher ล้าน group precedes this one, so a trailing 1 reads as "เอ็ด".
 */
function readGroup(value: number, hasHigherDigits = false): string {
  if (value === 0) return '';
  const digits = String(value).split('').map(Number).reverse();
  let text = '';
  for (let position = digits.length - 1; position >= 0; position -= 1) {
    const digit = digits[position];
    if (digit === 0) continue;
    if (position === 0) {
      text += digit === 1 && (digits.length > 1 || hasHigherDigits) ? 'เอ็ด' : DIGITS[digit];
    } else if (position === 1) {
      text += digit === 1 ? 'สิบ' : digit === 2 ? 'ยี่สิบ' : `${DIGITS[digit]}สิบ`;
    } else {
      text += `${DIGITS[digit]}${PLACES[position]}`;
    }
  }
  return text;
}

/** Reads a non-negative integer of any size in Thai words (ล้าน groups). */
function readInteger(value: number): string {
  if (value === 0) return DIGITS[0];
  const groups: number[] = [];
  let remaining = value;
  while (remaining > 0) {
    groups.push(remaining % 1_000_000);
    remaining = Math.floor(remaining / 1_000_000);
  }
  return groups
    .map((group, index) => (group === 0 ? '' : readGroup(group, index < groups.length - 1) + 'ล้าน'.repeat(index)))
    .reverse()
    .join('');
}

/**
 * Converts an amount to Thai baht words, e.g. 777600 → "เจ็ดแสนเจ็ดหมื่นเจ็ดพันหกร้อยบาทถ้วน".
 * Negative amounts are prefixed with "ลบ".
 */
export function thaiBahtText(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const negative = safe < 0;
  const rounded = Math.round(Math.abs(safe) * 100);
  const baht = Math.floor(rounded / 100);
  const satang = rounded % 100;

  let text = '';
  if (baht > 0 || satang === 0) text += `${readInteger(baht)}บาท`;
  text += satang === 0 ? 'ถ้วน' : `${readGroup(satang)}สตางค์`;
  return negative ? `ลบ${text}` : text;
}
