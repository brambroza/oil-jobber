'use client';

import { useState } from 'react';
import { TextField } from '@mui/material';
import { round4, toDisplayPrice, toUnitPriceInclVat } from '@/lib/utils/vat-price';
import type { VatMode } from '@/lib/documents/vat-mode';

export { toDisplayPrice, toUnitPriceInclVat };

/**
 * Per-liter price input that shows/accepts the price excl. or incl. VAT while
 * the form keeps storing the VAT-inclusive price. The typed text is kept as is
 * while focused so the conversion never rewrites what the user is typing.
 */
export default function VatPriceInput({
  unitPriceInclVat,
  mode,
  onChange,
  error,
  helperText,
}: {
  unitPriceInclVat: number;
  mode: VatMode;
  /** Receives the VAT-inclusive price (4 decimals). */
  onChange: (unitPriceInclVat: number) => void;
  error?: boolean;
  helperText?: string;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(round4(toDisplayPrice(Number(unitPriceInclVat || 0), mode)));

  return (
    <TextField
      size="small"
      type="number"
      value={shown}
      onFocus={(e) => { setDraft(shown); e.target.select(); }}
      onBlur={() => setDraft(null)}
      onChange={(e) => {
        setDraft(e.target.value);
        onChange(toUnitPriceInclVat(Number(e.target.value || 0), mode));
      }}
      error={error}
      helperText={helperText}
      slotProps={{ htmlInput: { step: '0.0001', min: 0 }, formHelperText: { sx: { mx: 0, whiteSpace: 'nowrap', textAlign: 'right' } } }}
      sx={{ width: 140 }}
    />
  );
}
