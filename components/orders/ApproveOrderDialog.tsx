'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';

type Credit = {
  payment_type: string | null;
  credit_limit: number;
  used_credit: number;
  available_credit: number;
  order_total: number;
  exceeded: boolean;
};

type Props = {
  open: boolean;
  orderId: string | null;
  orderNo: string;
  customerName: string;
  onClose: () => void;
  /** Called after a successful approval so the caller can reload. */
  onApproved: () => void;
};

const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Approval step for an order: shows the customer's credit position (this
 * order already counted) and, when a credit-term order exceeds the limit,
 * requires an explicit over-credit confirmation with a reason.
 */
export default function ApproveOrderDialog({ open, orderId, orderNo, customerName, onClose, onApproved }: Props) {
  const [credit, setCredit] = useState<Credit | null>(null);
  const [canApprove, setCanApprove] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [override, setOverride] = useState(false);

  useEffect(() => {
    if (!open || !orderId) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    setNote('');
    setOverride(false);
    setCredit(null);
    fetch(`/api/orders/${orderId}/approve`, { cache: 'no-store' })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'โหลดข้อมูลเครดิตไม่สำเร็จ');
        if (cancelled) return;
        setCredit(data.credit);
        setCanApprove(Boolean(data.can_approve));
      })
      .catch((e) => { if (!cancelled) setError((e as Error).message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, orderId]);

  const exceeded = Boolean(credit?.exceeded);
  const isCredit = credit?.payment_type === 'CREDIT';
  const blocked = loading || saving || !canApprove || (exceeded && (!override || !note.trim()));

  const approve = async () => {
    if (!orderId) return;
    setSaving(true);
    setError('');
    const res = await fetch(`/api/orders/${orderId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note: note.trim() || null, allow_over_credit: exceeded && override }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || 'อนุมัติไม่สำเร็จ');
      if (data.credit) setCredit(data.credit);
      return;
    }
    onApproved();
    onClose();
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth='xs'>
      <DialogTitle>อนุมัติใบสั่งขาย {orderNo || ''}</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          <Typography variant='body2' color='text.secondary'>ลูกค้า: {customerName || '-'}</Typography>
          {error ? <Alert severity='error'>{error}</Alert> : null}
          {!canApprove && !loading ? <Alert severity='warning'>คำสั่งซื้อนี้ไม่ได้อยู่ในสถานะรออนุมัติ</Alert> : null}
          {credit ? (
            <Table size='small'>
              <TableBody>
                <TableRow><TableCell>เงื่อนไขชำระ</TableCell><TableCell align='right'>{isCredit ? 'เครดิต' : (credit.payment_type === 'CASH' ? 'เงินสด' : credit.payment_type || '-')}</TableCell></TableRow>
                <TableRow><TableCell>ยอดบิลนี้</TableCell><TableCell align='right'>{money(credit.order_total)}</TableCell></TableRow>
                <TableRow><TableCell>วงเงินเครดิต</TableCell><TableCell align='right'>{money(credit.credit_limit)}</TableCell></TableRow>
                <TableRow><TableCell>ใช้ไปแล้ว (รวมบิลนี้)</TableCell><TableCell align='right'>{money(credit.used_credit)}</TableCell></TableRow>
                <TableRow>
                  <TableCell sx={{ fontWeight: 700 }}>คงเหลือหลังอนุมัติ</TableCell>
                  <TableCell align='right' sx={{ fontWeight: 700, color: credit.available_credit < 0 ? 'error.main' : 'success.main' }}>{money(credit.available_credit)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (loading ? <Typography variant='body2'>กำลังตรวจสอบวงเงิน...</Typography> : null)}
          {exceeded ? (
            <>
              <Alert severity='error'>วงเงินเครดิตไม่พอสำหรับบิลนี้ การอนุมัติจะถูกบันทึกว่า "อนุมัติเกินวงเงิน" พร้อมชื่อผู้อนุมัติ</Alert>
              <FormControlLabel control={<Checkbox checked={override} onChange={(e) => setOverride(e.target.checked)} />} label='ยืนยันอนุมัติเกินวงเงิน' />
            </>
          ) : null}
          {credit && !exceeded && isCredit ? <Alert severity='success'>วงเงินเครดิตเพียงพอ</Alert> : null}
          <TextField
            size='small'
            label={exceeded ? 'เหตุผลที่อนุมัติเกินวงเงิน (บังคับ)' : 'หมายเหตุการอนุมัติ (ถ้ามี)'}
            multiline
            minRows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            required={exceeded}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>ยกเลิก</Button>
        <Button variant='contained' color={exceeded ? 'error' : 'success'} onClick={() => void approve()} disabled={blocked}>
          {saving ? 'กำลังอนุมัติ...' : exceeded ? 'อนุมัติเกินวงเงิน' : 'อนุมัติ'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
