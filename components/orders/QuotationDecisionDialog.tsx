'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';
import type { QuotationDecision } from '@/lib/utils/quotation-status';

export type QuotationDecisionTarget = {
  orderId: string;
  docNo: string;
  action: QuotationDecision;
  customerName?: string | null;
} | null;

const COPY: Record<QuotationDecision, { title: string; body: string; confirm: string; color: 'success' | 'warning' | 'error'; noteLabel: string }> = {
  convert: {
    title: 'อนุมัติเป็นใบสั่งขาย',
    body: 'ใบเสนอราคาจะถูกบันทึกว่า "อนุมัติแล้ว" และกลายเป็นใบสั่งขาย (สถานะ ส่งคำสั่งซื้อ) เข้าขั้นตอนอนุมัติ/จองโรงกลั่นตามปกติในเมนูใบสั่งขาย',
    confirm: 'อนุมัติเป็นใบสั่งขาย',
    color: 'success',
    noteLabel: 'หมายเหตุ (เช่น ลูกค้ายืนยันทาง LINE)',
  },
  reject: {
    title: 'ลูกค้าปฏิเสธใบเสนอราคา',
    body: 'ใบเสนอราคาจะถูกปิด ไม่นับเป็นยอดขาย และแก้ไขต่อไม่ได้',
    confirm: 'บันทึกลูกค้าปฏิเสธ',
    color: 'warning',
    noteLabel: 'เหตุผล (เช่น ราคาสูงกว่าเจ้าอื่น)',
  },
  cancel: {
    title: 'ยกเลิกใบเสนอราคา',
    body: 'ใบเสนอราคาจะถูกยกเลิก ไม่นับเป็นยอดขาย และแก้ไขต่อไม่ได้',
    confirm: 'ยืนยันยกเลิก',
    color: 'error',
    noteLabel: 'เหตุผลที่ยกเลิก',
  },
};

/**
 * Confirms the customer's answer on a quotation-first order and posts it to
 * `/api/quotations/[orderId]/decision`.
 */
export default function QuotationDecisionDialog({
  target,
  onClose,
  onDone,
  onNotify,
}: {
  target: QuotationDecisionTarget;
  onClose: () => void;
  /** Called after the server recorded the decision. */
  onDone: (result: { action: QuotationDecision; orderId: string; orderNo: string | null }) => void;
  onNotify: (message: string, severity: 'success' | 'error' | 'info' | 'warning') => void;
}) {
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setNote('');
    setError('');
  }, [target?.orderId, target?.action]);

  if (!target) return null;
  const copy = COPY[target.action];

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/quotations/${target.orderId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: target.action, note }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      onDone({ action: target.action, orderId: target.orderId, orderNo: data.order_no ?? null });
    } catch (caught) {
      const message = (caught as Error).message;
      setError(message);
      onNotify(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onClose={saving ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? <Alert severity="error">{error}</Alert> : null}
          <Typography variant="body2">
            <b>{target.docNo}</b>{target.customerName ? ` · ${target.customerName}` : ''}
          </Typography>
          <Typography variant="body2" color="text.secondary">{copy.body}</Typography>
          <TextField
            size="small"
            label={copy.noteLabel}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            multiline
            minRows={2}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>ปิด</Button>
        <Button variant="contained" color={copy.color} onClick={() => void submit()} disabled={saving}>
          {saving ? 'กำลังบันทึก...' : copy.confirm}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
