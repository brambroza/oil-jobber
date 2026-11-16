'use client';

import { useEffect, useState } from 'react';
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, InputAdornment, MenuItem, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { CheckCircleOutline, ContentCopy, HighlightOff, Link as LinkIcon, OpenInNew, Send } from '@mui/icons-material';
import { PAYMENT_METHOD_LABELS } from '@/lib/documents/format';
import { formatDate, formatDateTime } from '@/lib/utils/date-format';
import { defaultApproveAmount, SLIP_STATUS_LABELS, type PaymentLinkState, type SlipStatus } from '@/lib/utils/payment-slip';

export type PaymentSlipRow = {
  id: string;
  sale_order_id: string;
  order_no: string | null;
  customer_name: string | null;
  file_mime: string;
  amount: number;
  transferred_at: string;
  reference_no: string | null;
  payer_name: string | null;
  note: string | null;
  status: SlipStatus;
  reject_reason: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  outstanding: number;
  created_at: string;
};

type LinkInfo = { id: string; expires_at: string; revoked_at: string | null; sent_line_at: string | null; created_at: string; state: PaymentLinkState } | null;

const money = (value: number) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const STATUS_COLOR: Record<SlipStatus, 'warning' | 'success' | 'error'> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'error' };
const LINK_STATE_LABELS: Record<PaymentLinkState, string> = {
  ACTIVE: 'ใช้งานได้', EXPIRED: 'หมดอายุ', REVOKED: 'ถูกแทนที่ด้วยลิงก์ใหม่', PAID: 'ชำระครบแล้ว', CLOSED: 'ปิดรับชำระ',
};
const slipFileUrl = (id: string) => `/api/accounting/payment-slip/${id}/file`;

/**
 * Creates the customer slip-upload link of one order and copies it or sends it via LINE.
 * Each new link replaces the previous one; it lasts 7 days or until the bill is paid.
 */
export function PaymentLinkPanel({ orderId, onNotify }: { orderId: string; onNotify?: (message: string, severity: 'success' | 'error' | 'info') => void }) {
  const [info, setInfo] = useState<LinkInfo>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    const res = await fetch(`/api/accounting/payment-link?sale_order_id=${orderId}`, { cache: 'no-store' });
    if (res.ok) setInfo(await res.json());
  };
  useEffect(() => {
    setUrl('');
    setError('');
    void load();
  }, [orderId]);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onNotify?.('คัดลอกลิงก์แล้ว', 'success');
    } catch {
      onNotify?.('คัดลอกไม่สำเร็จ กรุณาคัดลอกจากช่องลิงก์', 'info');
    }
  };

  const create = async (sendLine: boolean) => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/accounting/payment-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_order_id: orderId, send_line: sendLine }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'สร้างลิงก์ไม่สำเร็จ');
      setUrl(data.url);
      if (sendLine) {
        if (data.line?.ok) onNotify?.('ส่งลิงก์ทาง LINE แล้ว', 'success');
        else setError(`สร้างลิงก์แล้ว แต่ส่ง LINE ไม่สำเร็จ: ${data.line?.error || ''} (คัดลอกลิงก์ไปส่งเองได้)`);
      } else {
        await copy(data.url);
      }
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ border: '1px dashed #c7c3e6', borderRadius: 1.5, p: 1.5 }}>
      <Stack spacing={1}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }} justifyContent='space-between'>
          <Box>
            <Typography fontWeight={800}>ลิงก์ให้ลูกค้าแนบสลิป</Typography>
            <Typography variant='caption' color='text.secondary'>
              {info
                ? `ลิงก์ล่าสุด: ${LINK_STATE_LABELS[info.state]} · หมดอายุ ${formatDate(info.expires_at)}${info.sent_line_at ? ' · ส่ง LINE แล้ว' : ''}`
                : 'ยังไม่เคยสร้างลิงก์ · ลิงก์ใช้ได้ 7 วัน หรือจนชำระครบ'}
            </Typography>
          </Box>
          <Stack direction='row' spacing={1}>
            <Button size='small' variant='outlined' startIcon={<LinkIcon />} disabled={busy} onClick={() => void create(false)}>สร้าง & คัดลอก</Button>
            <Button size='small' variant='contained' startIcon={<Send />} disabled={busy} onClick={() => void create(true)}>ส่ง LINE</Button>
          </Stack>
        </Stack>
        {url ? (
          <TextField
            id='payment-link-url'
            size='small'
            value={url}
            InputProps={{
              readOnly: true,
              endAdornment: (
                <InputAdornment position='end'>
                  <IconButton size='small' onClick={() => void copy(url)} aria-label='คัดลอกลิงก์'><ContentCopy fontSize='small' /></IconButton>
                </InputAdornment>
              ),
            }}
            helperText='ลิงก์นี้แสดงครั้งเดียว ถ้าต้องการอีกให้สร้างใหม่ (ลิงก์เก่าจะใช้ไม่ได้)'
            fullWidth
          />
        ) : null}
        {error ? <Alert severity='warning' onClose={() => setError('')}>{error}</Alert> : null}
      </Stack>
    </Box>
  );
}

/**
 * Customer-uploaded slips: review list with approve (records payment + receipt)
 * and reject. Without `orderId` it shows the company-wide PENDING queue.
 */
export function PaymentSlipList({ orderId, refreshKey, onChanged, onPrintReceipt, emptyText }: {
  orderId?: string;
  refreshKey?: number;
  onChanged?: () => void;
  onPrintReceipt?: (receiptId: string, receiptNo: string) => void;
  emptyText?: string;
}) {
  const [rows, setRows] = useState<PaymentSlipRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState<PaymentSlipRow | null>(null);
  const [rejecting, setRejecting] = useState<PaymentSlipRow | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const qs = orderId ? `status=ALL&sale_order_id=${orderId}` : 'status=PENDING';
    const res = await fetch(`/api/accounting/payment-slip?${qs}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดสลิปไม่สำเร็จ');
    else setRows(data);
    setLoading(false);
  };
  useEffect(() => { void load(); }, [orderId, refreshKey]);

  const afterReview = async () => {
    setApproving(null);
    setRejecting(null);
    await load();
    onChanged?.();
  };

  if (orderId && !rows.length && !loading && !error) return null;

  return (
    <Box>
      {orderId ? <Typography fontWeight={800} sx={{ mb: 0.5 }}>สลิปจากลูกค้า</Typography> : null}
      {error ? <Alert severity='error' sx={{ mb: 1 }}>{error}</Alert> : null}
      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>ส่งเมื่อ</TableCell>
              {!orderId ? <TableCell>คำสั่งซื้อ</TableCell> : null}
              {!orderId ? <TableCell>ลูกค้า</TableCell> : null}
              <TableCell>วันที่โอน</TableCell>
              <TableCell>อ้างอิง / ผู้โอน</TableCell>
              <TableCell align='right'>ยอดที่แจ้ง</TableCell>
              {!orderId ? <TableCell align='right'>คงค้าง</TableCell> : null}
              <TableCell>สถานะ</TableCell>
              <TableCell align='right'></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDateTime(r.created_at)}</TableCell>
                {!orderId ? <TableCell>{r.order_no || r.sale_order_id.slice(0, 8)}</TableCell> : null}
                {!orderId ? <TableCell>{r.customer_name || '-'}</TableCell> : null}
                <TableCell>{formatDate(r.transferred_at)}</TableCell>
                <TableCell>
                  {r.reference_no || '-'}
                  {r.payer_name ? <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>{r.payer_name}</Typography> : null}
                </TableCell>
                <TableCell align='right' sx={{ fontWeight: 800 }}>{money(r.amount)}</TableCell>
                {!orderId ? <TableCell align='right'>{money(r.outstanding)}</TableCell> : null}
                <TableCell>
                  <Chip size='small' color={STATUS_COLOR[r.status]} label={SLIP_STATUS_LABELS[r.status]} />
                  {r.status === 'REJECTED' && r.reject_reason ? <Typography variant='caption' color='error' sx={{ display: 'block' }}>{r.reject_reason}</Typography> : null}
                  {r.status !== 'PENDING' && r.reviewed_by_name ? <Typography variant='caption' color='text.secondary' sx={{ display: 'block' }}>โดย {r.reviewed_by_name}</Typography> : null}
                </TableCell>
                <TableCell align='right' sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title='เปิดไฟล์สลิป'>
                    <IconButton size='small' component='a' href={slipFileUrl(r.id)} target='_blank' rel='noopener noreferrer'><OpenInNew fontSize='small' /></IconButton>
                  </Tooltip>
                  {r.status === 'PENDING' ? (
                    <>
                      <Tooltip title='ยืนยันรับชำระ'>
                        <IconButton size='small' color='success' onClick={() => setApproving(r)}><CheckCircleOutline fontSize='small' /></IconButton>
                      </Tooltip>
                      <Tooltip title='ไม่อนุมัติ'>
                        <IconButton size='small' color='error' onClick={() => setRejecting(r)}><HighlightOff fontSize='small' /></IconButton>
                      </Tooltip>
                    </>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
            {!rows.length ? (
              <TableRow><TableCell colSpan={9} align='center' sx={{ color: 'text.secondary' }}>{loading ? 'กำลังโหลด...' : emptyText || 'ไม่มีสลิปรอตรวจสอบ'}</TableCell></TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Box>
      <ApproveSlipDialog slip={approving} onClose={() => setApproving(null)} onDone={afterReview} onPrintReceipt={onPrintReceipt} />
      <RejectSlipDialog slip={rejecting} onClose={() => setRejecting(null)} onDone={afterReview} />
    </Box>
  );
}

/** Staff confirm the amount actually received; approving records the payment and issues a receipt. */
function ApproveSlipDialog({ slip, onClose, onDone, onPrintReceipt }: {
  slip: PaymentSlipRow | null;
  onClose: () => void;
  onDone: () => void;
  onPrintReceipt?: (receiptId: string, receiptNo: string) => void;
}) {
  const [form, setForm] = useState({ amount: 0, paid_at: '', payment_method: 'TRANSFER', reference_no: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slip) return;
    setError('');
    setForm({
      amount: defaultApproveAmount(slip.amount, slip.outstanding),
      paid_at: slip.transferred_at,
      payment_method: 'TRANSFER',
      reference_no: slip.reference_no || '',
      note: slip.payer_name ? `ผู้โอน: ${slip.payer_name}` : '',
    });
  }, [slip?.id]);

  const valid = Boolean(slip) && form.amount > 0 && form.amount <= (slip?.outstanding ?? 0) + 0.005 && Boolean(form.paid_at);

  const save = async () => {
    if (!slip) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/accounting/payment-slip/${slip.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ยืนยันสลิปไม่สำเร็จ');
      onDone();
      if (data.receipt_id && data.receipt_no) onPrintReceipt?.(data.receipt_id, data.receipt_no);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(slip)} onClose={onClose} maxWidth='sm' fullWidth>
      <DialogTitle>
        ยืนยันรับชำระจากสลิป {slip?.order_no ? `· ${slip.order_no}` : ''}
        {slip?.customer_name ? <Typography variant='body2' color='text.secondary'>{slip.customer_name}</Typography> : null}
      </DialogTitle>
      <DialogContent>
        {slip ? (
          <Stack spacing={1.5} sx={{ pt: 1 }}>
            {error ? <Alert severity='error' onClose={() => setError('')}>{error}</Alert> : null}
            <Alert severity='info'>ตรวจยอดเงินเข้าบัญชีจริงก่อนยืนยัน · ลูกค้าแจ้ง {money(slip.amount)} บาท · คงค้าง {money(slip.outstanding)} บาท</Alert>
            {slip.file_mime.startsWith('image/') ? (
              <Box component='a' href={slipFileUrl(slip.id)} target='_blank' rel='noopener noreferrer'>
                <Box component='img' src={slipFileUrl(slip.id)} alt='สลิป' sx={{ width: '100%', maxHeight: 380, objectFit: 'contain', border: '1px solid #e2e8f0', borderRadius: 1 }} />
              </Box>
            ) : (
              <Button variant='outlined' href={slipFileUrl(slip.id)} target='_blank' rel='noopener noreferrer' startIcon={<OpenInNew />}>เปิดไฟล์ PDF</Button>
            )}
            {slip.note ? <Typography variant='body2'>หมายเหตุจากลูกค้า: {slip.note}</Typography> : null}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField
                id='slip-approve-amount'
                size='small'
                label='จำนวนเงินที่รับจริง'
                type='number'
                value={form.amount}
                onFocus={(e) => e.target.select()}
                onChange={(e) => setForm((p) => ({ ...p, amount: Number(e.target.value || 0) }))}
                inputProps={{ step: '0.01', min: 0 }}
                error={form.amount > slip.outstanding + 0.005}
                helperText={form.amount > slip.outstanding + 0.005 ? 'ยอดเกินยอดค้าง' : ' '}
                fullWidth
              />
              <TextField id='slip-approve-date' size='small' label='วันที่รับชำระ' type='date' value={form.paid_at} onChange={(e) => setForm((p) => ({ ...p, paid_at: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5}>
              <TextField id='slip-approve-method' size='small' select label='วิธีชำระ' value={form.payment_method} onChange={(e) => setForm((p) => ({ ...p, payment_method: e.target.value }))} fullWidth>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([code, label]) => <MenuItem key={code} value={code}>{label}</MenuItem>)}
              </TextField>
              <TextField id='slip-approve-reference' size='small' label='เลขอ้างอิง' value={form.reference_no} onChange={(e) => setForm((p) => ({ ...p, reference_no: e.target.value }))} fullWidth />
            </Stack>
            <TextField id='slip-approve-note' size='small' label='หมายเหตุ' value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} fullWidth />
          </Stack>
        ) : null}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>ยกเลิก</Button>
        <Button variant='contained' color='success' disabled={!valid || saving} onClick={() => void save()}>
          {saving ? 'กำลังบันทึก...' : 'ยืนยันและออกใบเสร็จ'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Rejects a slip; the reason is shown to the customer on the link page. */
function RejectSlipDialog({ slip, onClose, onDone }: { slip: PaymentSlipRow | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setReason('');
    setError('');
  }, [slip?.id]);

  const save = async () => {
    if (!slip) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/accounting/payment-slip/${slip.id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(slip)} onClose={onClose} maxWidth='xs' fullWidth>
      <DialogTitle>ไม่อนุมัติสลิป</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error ? <Alert severity='error'>{error}</Alert> : null}
          <TextField
            id='slip-reject-reason'
            size='small'
            label='เหตุผล (ลูกค้าจะเห็นข้อความนี้)'
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder='เช่น ยอดเงินยังไม่เข้าบัญชี, สลิปไม่ชัด'
            inputProps={{ maxLength: 500 }}
            multiline
            minRows={2}
            fullWidth
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>ยกเลิก</Button>
        <Button variant='contained' color='error' disabled={!reason.trim() || saving} onClick={() => void save()}>ไม่อนุมัติ</Button>
      </DialogActions>
    </Dialog>
  );
}
