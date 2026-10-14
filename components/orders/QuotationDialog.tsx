'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import { formatDate } from '@/lib/utils/date-format';

export type QuotationDialogOrder = { id: string; orderNo: string } | null;

type ActiveQuotation = {
  quotation_no: string;
  issued_at: string;
  valid_until: string | null;
  note: string | null;
};

/** Today's date in Asia/Bangkok as `YYYY-MM-DD`. */
function todayBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/** `YYYY-MM-DD` → `DD/MM/YYYY`. */
function dateThai(value: string | null): string {
  return formatDate(value);
}

/**
 * Issues (or re-issues) a quotation for a sale order. Shows the current
 * active quotation when there is one, with options to view it or issue a new
 * number with current prices.
 */
export default function QuotationDialog({
  order,
  onClose,
  onView,
  onNotify,
}: {
  order: QuotationDialogOrder;
  onClose: () => void;
  /** Open the quotation PDF of the order. */
  onView: (orderId: string, quotationNo: string) => void;
  onNotify: (message: string, severity: 'success' | 'error' | 'info' | 'warning') => void;
}) {
  const [existing, setExisting] = useState<ActiveQuotation | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!order) return;
    let active = true;
    setExisting(null);
    setError('');
    setValidUntil(todayBangkok());
    setNote('');
    setLoading(true);
    fetch(`/api/orders/${order.id}/quotation`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'โหลดใบเสนอราคาไม่สำเร็จ');
        if (active) setExisting(data.quotation ?? null);
      })
      .catch((caught) => { if (active) setError((caught as Error).message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [order]);

  const issue = async (reissue: boolean) => {
    if (!order) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/${order.id}/quotation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valid_until: validUntil, note, reissue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ออกใบเสนอราคาไม่สำเร็จ');
      const quotationNo = String(data.quotation?.quotation_no || '');
      onNotify(`ออกใบเสนอราคา ${quotationNo} แล้ว`, 'success');
      onClose();
      onView(order.id, quotationNo);
    } catch (caught) {
      const message = (caught as Error).message;
      setError(message);
      onNotify(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(order)} onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>ใบเสนอราคา {order?.orderNo ? `· ${order.orderNo}` : ''}</DialogTitle>
      <DialogContent>
        {loading ? (
          <Stack alignItems="center" sx={{ py: 3 }}><CircularProgress size={28} /></Stack>
        ) : (
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error ? <Alert severity="error">{error}</Alert> : null}
            {existing ? (
              <Alert severity="info">
                มีใบเสนอราคา <b>{existing.quotation_no}</b> ลงวันที่ {dateThai(existing.issued_at)}
                {existing.valid_until ? ` ยืนราคาถึง ${dateThai(existing.valid_until)}` : ''} แล้ว
                <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                  กด &quot;ออกใหม่&quot; เพื่อยกเลิกเลขเดิมและออกเลขใหม่ด้วยราคาปัจจุบันของใบสั่งขาย
                </Typography>
              </Alert>
            ) : null}
            <TextField
              size="small"
              type="date"
              label="ยืนราคาถึงวันที่"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: todayBangkok() } }}
              fullWidth
            />
            <TextField
              size="small"
              label="หมายเหตุ (พิมพ์บนใบเสนอราคา)"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              multiline
              minRows={2}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
              fullWidth
            />
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>ปิด</Button>
        {existing ? (
          <>
            <Button variant="outlined" onClick={() => { if (order) { onClose(); onView(order.id, existing.quotation_no); } }} disabled={saving}>
              ดู PDF
            </Button>
            <Button variant="contained" color="warning" onClick={() => void issue(true)} disabled={saving || loading}>
              ออกใหม่
            </Button>
          </>
        ) : (
          <Button variant="contained" onClick={() => void issue(false)} disabled={saving || loading}>
            ออกใบเสนอราคา
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
