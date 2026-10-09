'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material';

export type DeliveryRecordDialogOrder = {
  id: string;
  order_no: string;
  customer_name: string;
  delivered_at?: string | null;
  delivery_receiver_name?: string | null;
  delivery_record_note?: string | null;
  delivery_record_no?: string | null;
} | null;

type Props = {
  order: DeliveryRecordDialogOrder;
  onClose: () => void;
  /** Called with the fresh order row after saving (status may now be DELIVERED). */
  onSaved: (order: Record<string, any>) => void;
};

/** ISO → value for a `datetime-local` input in the browser's local time. */
function toLocalInput(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * บันทึกการส่งของ: records when the goods were delivered, who received them
 * and a note. Saving moves the order to DELIVERED (when it has not passed that
 * step) and assigns the DR document number; re-saving edits the details.
 */
export default function DeliveryRecordDialog({ order, onClose, onSaved }: Props) {
  const [deliveredAt, setDeliveredAt] = useState('');
  const [receiver, setReceiver] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!order) return;
    setDeliveredAt(toLocalInput(order.delivered_at));
    setReceiver(order.delivery_receiver_name || '');
    setNote(order.delivery_record_note || '');
    setError('');
  }, [order]);

  const save = async () => {
    if (!order) return;
    const when = deliveredAt ? new Date(deliveredAt) : new Date();
    if (Number.isNaN(when.getTime())) {
      setError('กรุณาระบุวันเวลาส่งของให้ถูกต้อง');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/${order.id}/delivery-record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivered_at: when.toISOString(),
          delivery_receiver_name: receiver.trim() || null,
          delivery_record_note: note.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกการส่งของไม่สำเร็จ');
      onSaved(data);
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(order)} onClose={saving ? undefined : onClose} fullWidth maxWidth='xs'>
      <DialogTitle>บันทึกการส่งของ {order?.order_no || ''}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ mt: 0.5 }}>
          <Typography variant='body2' color='text.secondary'>ลูกค้า: {order?.customer_name || '-'}</Typography>
          {order?.delivery_record_no ? (
            <Alert severity='info'>บันทึกไว้แล้ว เลขที่ {order.delivery_record_no} — แก้ไขรายละเอียดได้ เลขเอกสารคงเดิม</Alert>
          ) : null}
          {error ? <Alert severity='error'>{error}</Alert> : null}
          <TextField
            size='small'
            label='วันเวลาส่งของ'
            type='datetime-local'
            value={deliveredAt}
            onChange={(e) => setDeliveredAt(e.target.value)}
            InputLabelProps={{ shrink: true }}
            required
          />
          <TextField
            size='small'
            label='ชื่อผู้รับของ'
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            inputProps={{ maxLength: 200 }}
          />
          <TextField
            size='small'
            label='หมายเหตุ (ถ้ามี)'
            multiline
            minRows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            inputProps={{ maxLength: 1000 }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>ยกเลิก</Button>
        <Button variant='contained' color='success' onClick={() => void save()} disabled={saving || !deliveredAt}>
          {saving ? 'กำลังบันทึก...' : order?.delivery_record_no ? 'บันทึกการแก้ไข' : 'บันทึกการส่งของ'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
