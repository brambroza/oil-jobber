'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { DeleteOutline, PictureAsPdf } from '@mui/icons-material';
import { PAYMENT_METHOD_LABELS } from '@/lib/documents/format';
import { useCurrentUser } from '@/components/layout/CurrentUserProvider';

export type PaymentDialogOrder = {
  sale_order_id: string;
  order_no?: string | null;
  customer_name?: string | null;
  total_amount?: number;
};

type PaymentRow = {
  id: string;
  paid_at: string;
  amount: number;
  payment_method: string;
  reference_no: string | null;
  note: string | null;
  receipt_id: string | null;
  receipt_no: string | null;
  received_by_name: string | null;
};

const money = (value: number) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Records a payment against an order (partial payments allowed) and shows the
 * order's payment history with receipt links.
 */
export function PaymentDialog({ order, onClose, onSaved, onPrintReceipt }: {
  order: PaymentDialogOrder | null;
  onClose: () => void;
  onSaved?: (result: { receipt_no?: string | null; outstanding_after: number; order_status: string }) => void;
  onPrintReceipt?: (receiptId: string, receiptNo: string) => void;
}) {
  const me = useCurrentUser();
  const canVoid = ['SUPER_ADMIN', 'ADMIN', 'ACCOUNTING', 'OWNER'].includes(String(me?.role || ''));
  const [history, setHistory] = useState<PaymentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ paid_at: today(), amount: 0, payment_method: 'TRANSFER', reference_no: '', note: '' });

  const paid = useMemo(() => history.reduce((sum, row) => sum + Number(row.amount || 0), 0), [history]);
  const outstanding = useMemo(() => Math.max(0, Math.round((total - paid) * 100) / 100), [total, paid]);
  const amountValid = form.amount > 0 && form.amount <= outstanding + 0.005;

  const load = async (orderId: string) => {
    setLoading(true);
    setError('');
    try {
      const [historyRes, orderRes] = await Promise.all([
        fetch(`/api/accounting/payment?sale_order_id=${orderId}`, { cache: 'no-store' }),
        fetch(`/api/orders/${orderId}`, { cache: 'no-store' }),
      ]);
      const [historyData, orderData] = await Promise.all([historyRes.json(), orderRes.json()]);
      if (!historyRes.ok) throw new Error(historyData.error || 'โหลดประวัติการชำระไม่สำเร็จ');
      if (!orderRes.ok) throw new Error(orderData.error || 'โหลดคำสั่งซื้อไม่สำเร็จ');
      setHistory(historyData || []);
      const orderTotal = Number(orderData.total_amount || 0);
      setTotal(orderTotal);
      const paidSoFar = (historyData || []).reduce((sum: number, row: PaymentRow) => sum + Number(row.amount || 0), 0);
      setForm((prev) => ({ ...prev, amount: Math.max(0, Math.round((orderTotal - paidSoFar) * 100) / 100) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!order) return;
    setForm({ paid_at: today(), amount: 0, payment_method: 'TRANSFER', reference_no: '', note: '' });
    void load(order.sale_order_id);
  }, [order?.sale_order_id]);

  const save = async () => {
    if (!order) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/accounting/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_order_id: order.sale_order_id, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกการรับชำระไม่สำเร็จ');
      onSaved?.(data);
      await load(order.sale_order_id);
      if (data.receipt_id && data.receipt_no && onPrintReceipt) onPrintReceipt(data.receipt_id, data.receipt_no);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const voidPayment = async (paymentId: string) => {
    if (!order) return;
    setError('');
    const res = await fetch(`/api/accounting/payment/${paymentId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'ยกเลิกรายการไม่สำเร็จ');
      return;
    }
    await load(order.sale_order_id);
    onSaved?.({ outstanding_after: Number(data.outstanding_after || 0), order_status: 'WAITING_PAYMENT' });
  };

  return (
    <Dialog open={Boolean(order)} onClose={onClose} maxWidth='md' fullWidth>
      <DialogTitle>
        บันทึกรับชำระ {order?.order_no ? `· ${order.order_no}` : ''}
        {order?.customer_name ? <Typography variant='body2' color='text.secondary'>{order.customer_name}</Typography> : null}
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error ? <Alert severity='error' onClose={() => setError('')}>{error}</Alert> : null}
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
            {[
              { label: 'ยอดบิล', value: total, color: 'text.primary' },
              { label: 'รับแล้ว', value: paid, color: 'success.main' },
              { label: 'คงค้าง', value: outstanding, color: outstanding > 0 ? 'error.main' : 'success.main' },
            ].map((kpi) => (
              <Box key={kpi.label} sx={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 1.5, p: 1.2 }}>
                <Typography variant='caption' color='text.secondary'>{kpi.label}</Typography>
                <Typography sx={{ fontSize: 20, fontWeight: 900, color: kpi.color }}>{money(kpi.value)}</Typography>
              </Box>
            ))}
          </Stack>

          {outstanding > 0 ? (
            <Stack spacing={1.5}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField id='payment-paid-at' size='small' label='วันที่รับชำระ' type='date' value={form.paid_at} onChange={(e) => setForm((p) => ({ ...p, paid_at: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
                <TextField
                  id='payment-amount'
                  size='small'
                  label={`จำนวนเงิน (ไม่เกิน ${money(outstanding)})`}
                  type='number'
                  value={form.amount}
                  onFocus={(e) => e.target.select()}
                  onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value || 0) }))}
                  inputProps={{ step: '0.01', min: 0 }}
                  error={form.amount > 0 && !amountValid}
                  helperText={form.amount > outstanding + 0.005 ? 'ยอดเกินยอดค้าง' : ' '}
                  fullWidth
                />
              </Stack>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
                <TextField id='payment-method' size='small' select label='วิธีชำระ' value={form.payment_method} onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value }))} fullWidth>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([code, label]) => <MenuItem key={code} value={code}>{label}</MenuItem>)}
                </TextField>
                <TextField id='payment-reference' size='small' label='เลขอ้างอิง (เลขที่โอน / เลขเช็ค)' value={form.reference_no} onChange={(e) => setForm((p) => ({ ...p, reference_no: e.target.value }))} fullWidth />
              </Stack>
              <TextField id='payment-note' size='small' label='หมายเหตุ' value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} fullWidth />
            </Stack>
          ) : (
            <Alert severity='success'>บิลนี้ชำระครบแล้ว</Alert>
          )}

          <Box>
            <Typography fontWeight={800} sx={{ mb: 0.5 }}>ประวัติการรับชำระ</Typography>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>วันที่</TableCell>
                    <TableCell>ใบเสร็จ</TableCell>
                    <TableCell>วิธี</TableCell>
                    <TableCell>อ้างอิง</TableCell>
                    <TableCell align='right'>จำนวนเงิน</TableCell>
                    <TableCell>ผู้รับ</TableCell>
                    <TableCell align='right'></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {history.map((row) => (
                    <TableRow key={row.id} hover>
                      <TableCell>{row.paid_at}</TableCell>
                      <TableCell>{row.receipt_no || '-'}</TableCell>
                      <TableCell>{PAYMENT_METHOD_LABELS[row.payment_method] ?? row.payment_method}</TableCell>
                      <TableCell>{row.reference_no || '-'}</TableCell>
                      <TableCell align='right'>{money(row.amount)}</TableCell>
                      <TableCell>{row.received_by_name || '-'}</TableCell>
                      <TableCell align='right' sx={{ whiteSpace: 'nowrap' }}>
                        {row.receipt_id && row.receipt_no ? (
                          <Tooltip title='พิมพ์ใบเสร็จ'>
                            <IconButton size='small' color='primary' onClick={() => onPrintReceipt?.(row.receipt_id as string, row.receipt_no as string)}><PictureAsPdf fontSize='small' /></IconButton>
                          </Tooltip>
                        ) : null}
                        {canVoid ? (
                          <Tooltip title='ยกเลิกรายการนี้'>
                            <IconButton size='small' color='error' onClick={() => void voidPayment(row.id)}><DeleteOutline fontSize='small' /></IconButton>
                          </Tooltip>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!history.length ? <TableRow><TableCell colSpan={7} align='center' sx={{ color: 'text.secondary' }}>{loading ? 'กำลังโหลด...' : 'ยังไม่มีการรับชำระ'}</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </Box>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>ปิด</Button>
        {outstanding > 0 ? (
          <Button variant='contained' onClick={() => void save()} disabled={!amountValid || saving || loading}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกและออกใบเสร็จ'}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
