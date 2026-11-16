'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { CheckCircle, CloudUpload, Receipt } from '@mui/icons-material';
import { Alert, Box, Button, Chip, Container, Paper, Stack, TextField, Typography } from '@mui/material';
import { compressImageForOcr } from '@/lib/utils/image-compress';
import { formatDate } from '@/lib/utils/date-format';
import { LINK_STATE_MESSAGES, SLIP_MAX_BYTES, SLIP_STATUS_LABELS, type PaymentLinkState, type SlipStatus } from '@/lib/utils/payment-slip';

type PaymentView = {
  state: PaymentLinkState;
  company_name: string;
  order_no: string | null;
  invoice_no: string | null;
  customer_name: string | null;
  total_amount: number;
  paid_amount: number;
  outstanding: number;
  expires_at: string;
  submissions: Array<{ id: string; created_at: string; amount: number; transferred_at: string; status: SlipStatus; reject_reason: string | null }>;
};

const money = (value: number) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date().toISOString().slice(0, 10);
const STATUS_COLOR: Record<SlipStatus, 'warning' | 'success' | 'error'> = { PENDING: 'warning', APPROVED: 'success', REJECTED: 'error' };

/**
 * Turns the chosen file into what we upload: PDFs as-is, images re-encoded to
 * JPEG (≤2000px) so phone photos and HEIC files fit the 5 MB limit.
 * @param file file picked by the customer
 * @returns upload-ready blob and name
 */
async function prepareSlipFile(file: File): Promise<{ blob: Blob; name: string }> {
  if (file.type === 'application/pdf') return { blob: file, name: file.name };
  const { base64 } = await compressImageForOcr(file, 2000, 0.85);
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return { blob: new Blob([bytes], { type: 'image/jpeg' }), name: 'slip.jpg' };
}

/** Public page (no login) where a customer uploads a pay-in slip for one bill. */
export default function PaySlipPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const [view, setView] = useState<PaymentView | null>(null);
  const [loadError, setLoadError] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState({ amount: '', transferred_at: today(), reference_no: '', payer_name: '', note: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/public/payment-slip/${encodeURIComponent(token)}`, { cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setLoadError(data.error || 'ไม่พบลิงก์');
      return;
    }
    setView(data);
    setForm((p) => (p.amount ? p : { ...p, amount: String(data.outstanding ?? '') }));
  };
  useEffect(() => { void load(); }, [token]);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const amount = Number(form.amount || 0);
  const canSubmit = Boolean(file) && amount > 0 && Boolean(form.transferred_at) && !saving;
  const overpay = view ? amount > view.outstanding + 0.005 : false;

  const submit = async () => {
    if (!file) return;
    setSaving(true);
    setError('');
    try {
      if (file.type === 'application/pdf' && file.size > SLIP_MAX_BYTES) throw new Error('ไฟล์ PDF ใหญ่เกิน 5 MB');
      const prepared = await prepareSlipFile(file);
      const body = new FormData();
      body.append('file', prepared.blob, prepared.name);
      Object.entries(form).forEach(([key, value]) => body.append(key, value));
      const res = await fetch(`/api/public/payment-slip/${encodeURIComponent(token)}`, { method: 'POST', body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'ส่งสลิปไม่สำเร็จ');
      setDone(true);
      setFile(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const summary = useMemo(() => view ? [
    { label: 'ยอดบิล', value: view.total_amount, color: 'text.primary' },
    { label: 'ชำระแล้ว', value: view.paid_amount, color: 'success.main' },
    { label: 'คงค้าง', value: view.outstanding, color: view.outstanding > 0 ? 'error.main' : 'success.main' },
  ] : [], [view]);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: '#f5f5fb', py: { xs: 2, sm: 4 } }}>
      <Container maxWidth='sm' sx={{ px: 2 }}>
        <Stack spacing={2}>
          <Stack direction='row' spacing={1} alignItems='center'>
            <Receipt sx={{ color: '#716ab0' }} />
            <Box>
              <Typography variant='h6' fontWeight={800}>แนบสลิปการชำระเงิน</Typography>
              {view?.company_name ? <Typography variant='body2' color='text.secondary'>{view.company_name}</Typography> : null}
            </Box>
          </Stack>

          {loadError ? <Alert severity='error'>{loadError}</Alert> : null}
          {!view && !loadError ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

          {view ? (
            <Paper sx={{ p: 2 }}>
              <Stack spacing={0.5}>
                {view.customer_name ? <Typography fontWeight={800}>{view.customer_name}</Typography> : null}
                <Typography variant='body2' color='text.secondary'>
                  {view.invoice_no ? `ใบแจ้งหนี้ ${view.invoice_no}` : null}
                  {view.invoice_no && view.order_no ? ' · ' : null}
                  {view.order_no ? `คำสั่งซื้อ ${view.order_no}` : null}
                </Typography>
              </Stack>
              <Stack direction='row' spacing={1} sx={{ mt: 1.5 }}>
                {summary.map((kpi) => (
                  <Box key={kpi.label} sx={{ flex: 1, border: '1px solid #e2e8f0', borderRadius: 1.5, p: 1 }}>
                    <Typography variant='caption' color='text.secondary'>{kpi.label}</Typography>
                    <Typography sx={{ fontSize: { xs: 15, sm: 18 }, fontWeight: 900, color: kpi.color }}>{money(kpi.value)}</Typography>
                  </Box>
                ))}
              </Stack>
              {view.state === 'ACTIVE' ? (
                <Typography variant='caption' color='text.secondary' sx={{ display: 'block', mt: 1 }}>ลิงก์ใช้ได้ถึง {formatDate(view.expires_at)}</Typography>
              ) : null}
            </Paper>
          ) : null}

          {view && view.state !== 'ACTIVE' ? <Alert severity={view.state === 'PAID' ? 'success' : 'warning'}>{LINK_STATE_MESSAGES[view.state]}</Alert> : null}

          {done ? (
            <Alert severity='success' icon={<CheckCircle />} onClose={() => setDone(false)}>
              ส่งสลิปเรียบร้อย เจ้าหน้าที่จะตรวจสอบและออกใบเสร็จให้
            </Alert>
          ) : null}

          {view?.state === 'ACTIVE' ? (
            <Paper sx={{ p: 2 }}>
              <Stack spacing={1.5}>
                <Typography fontWeight={800}>ข้อมูลการโอน</Typography>
                {error ? <Alert severity='error' onClose={() => setError('')}>{error}</Alert> : null}
                <Button component='label' variant={file ? 'outlined' : 'contained'} startIcon={<CloudUpload />} sx={{ py: 1.5, bgcolor: file ? undefined : '#716ab0' }}>
                  {file ? `เปลี่ยนไฟล์ (${file.name})` : 'เลือกรูปสลิป / ไฟล์ PDF'}
                  <input hidden type='file' accept='image/*,application/pdf' onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </Button>
                {preview ? <Box component='img' src={preview} alt='ตัวอย่างสลิป' sx={{ maxHeight: 360, objectFit: 'contain', borderRadius: 1, border: '1px solid #e2e8f0' }} /> : null}
                <TextField
                  id='slip-amount'
                  label='จำนวนเงินที่โอน (บาท)'
                  type='number'
                  value={form.amount}
                  onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))}
                  inputProps={{ step: '0.01', min: 0, inputMode: 'decimal' }}
                  helperText={overpay ? 'ยอดโอนมากกว่ายอดคงค้าง เจ้าหน้าที่จะตรวจสอบให้' : ' '}
                  fullWidth
                />
                <TextField id='slip-date' label='วันที่โอน' type='date' value={form.transferred_at} onChange={(e) => setForm((p) => ({ ...p, transferred_at: e.target.value }))} InputLabelProps={{ shrink: true }} fullWidth />
                <TextField id='slip-reference' label='เลขอ้างอิงการโอน (ถ้ามี)' value={form.reference_no} onChange={(e) => setForm((p) => ({ ...p, reference_no: e.target.value }))} inputProps={{ maxLength: 100 }} fullWidth />
                <TextField id='slip-payer' label='ชื่อผู้โอน (ถ้ามี)' value={form.payer_name} onChange={(e) => setForm((p) => ({ ...p, payer_name: e.target.value }))} inputProps={{ maxLength: 200 }} fullWidth />
                <TextField id='slip-note' label='หมายเหตุ' value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} inputProps={{ maxLength: 500 }} multiline minRows={2} fullWidth />
                <Button variant='contained' size='large' disabled={!canSubmit} onClick={() => void submit()} sx={{ bgcolor: '#716ab0' }}>
                  {saving ? 'กำลังส่ง...' : 'ส่งสลิป'}
                </Button>
              </Stack>
            </Paper>
          ) : null}

          {view?.submissions.length ? (
            <Paper sx={{ p: 2 }}>
              <Typography fontWeight={800} sx={{ mb: 1 }}>สลิปที่ส่งแล้ว</Typography>
              <Stack spacing={1}>
                {view.submissions.map((s) => (
                  <Stack key={s.id} direction='row' justifyContent='space-between' alignItems='center' sx={{ borderBottom: '1px solid #eef0f5', pb: 1 }}>
                    <Box>
                      <Typography variant='body2' fontWeight={700}>{money(s.amount)} บาท</Typography>
                      <Typography variant='caption' color='text.secondary'>โอนวันที่ {formatDate(s.transferred_at)}</Typography>
                      {s.status === 'REJECTED' && s.reject_reason ? <Typography variant='caption' color='error' sx={{ display: 'block' }}>เหตุผล: {s.reject_reason}</Typography> : null}
                    </Box>
                    <Chip size='small' color={STATUS_COLOR[s.status]} label={SLIP_STATUS_LABELS[s.status]} />
                  </Stack>
                ))}
              </Stack>
            </Paper>
          ) : null}
        </Stack>
      </Container>
    </Box>
  );
}
