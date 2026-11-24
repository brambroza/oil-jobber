'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Add, Delete, Edit, PictureAsPdf, ReceiptLong } from '@mui/icons-material';
import {
  Alert, Box, Button, Checkbox, Chip, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton,
  LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { formatDateTime } from '@/lib/utils/date-format';
import { validateTripLines, type TripLine } from '@/lib/utils/delivery-trips';

/** Order the dialog is opened for. */
export type DeliveryTripsDialogOrder = { id: string; order_no: string; customer_name: string } | null;

type TripItem = { id: string; product_code: string; product_name: string; liters: number; delivered: number };
type TripInvoice = { id: string; invoice_no: string; issued_at: string; status: string; total_amount: number };
type Trip = {
  id: string;
  trip_no: number;
  delivery_record_no: string | null;
  delivered_at: string;
  lines: TripLine[];
  total_liters: number;
  vehicle_license_plate: string | null;
  vehicle_driver_name: string | null;
  receiver_name: string | null;
  note: string | null;
  invoice: TripInvoice | null;
};
type TripsData = {
  order: { id: string; order_no: string | null; order_status: string; customer_name: string | null; vehicle_license_plate: string | null; vehicle_driver_name: string | null; can_record: boolean };
  items: TripItem[];
  trips: Trip[];
  full_invoice: { id: string; invoice_no: string } | null;
  can_issue_invoice: boolean;
};

/** What the parent should know after a change (to refresh lists and show a message). */
export type DeliveryTripsChange = {
  message: string;
  severity: 'success' | 'warning';
  advanced?: boolean;
  /** Tax invoice issued by this change (new trip + invoice, or a pending trip invoiced). */
  invoice?: { id: string; invoice_no: string };
};

type Props = {
  order: DeliveryTripsDialogOrder;
  onClose: () => void;
  onChanged: (change: DeliveryTripsChange) => void;
  /** Opens a PDF preview (บันทึกการส่งของ / ใบกำกับภาษี). */
  onOpenPdf: (type: 'delivery-record' | 'tax-invoice', id: string, title: string) => void;
  /**
   * 'delivery' (default): บันทึกส่งของ, issuing the invoice is optional.
   * 'invoice': ออกใบกำกับภาษี from the remaining liters (used on the invoices page);
   * the trip is always saved together with its tax invoice.
   */
  mode?: 'delivery' | 'invoice';
  /** Keeps the dialog open without an order (e.g. while picking one in `header`). Defaults to `Boolean(order)`. */
  open?: boolean;
  /** Rendered at the top of the content, e.g. an order picker. */
  header?: ReactNode;
};

type FormState = {
  /** null = new trip */
  editingId: string | null;
  deliveredAt: string;
  plate: string;
  driver: string;
  receiver: string;
  note: string;
  liters: Record<string, string>;
  issueInvoice: boolean;
};

const fmt = (n: number, digits = 0) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: digits, maximumFractionDigits: 2 });

/** ISO → value for a `datetime-local` input in the browser's local time. */
function toLocalInput(iso: string | null | undefined): string {
  const date = iso ? new Date(iso) : new Date();
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Parses a liters input ("12,000" → 12000; empty → 0). */
function parseLiters(raw: string): number {
  const cleaned = String(raw || '').replace(/,/g, '').trim();
  return cleaned === '' ? 0 : Number(cleaned);
}

/**
 * เที่ยวส่งของ: lists the delivery trips of an order (each with its DR number
 * and tax invoice) and records a new trip. Liters default to what is left;
 * "ออกใบกำกับภาษีเที่ยวนี้ทันที" issues the trip's invoice in the same save.
 */
export default function DeliveryTripsDialog({ order, onClose, onChanged, onOpenPdf, mode = 'delivery', open, header }: Props) {
  const invoiceMode = mode === 'invoice';
  const [data, setData] = useState<TripsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<FormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Trip | null>(null);

  /** Blank form for a new trip: remaining liters, the order's vehicle, now. */
  const newTripForm = (d: TripsData): FormState => ({
    editingId: null,
    deliveredAt: toLocalInput(null),
    plate: d.order.vehicle_license_plate || '',
    driver: d.order.vehicle_driver_name || '',
    receiver: '',
    note: '',
    liters: Object.fromEntries(d.items.map((it) => [it.id, it.liters - it.delivered > 0 ? fmt(it.liters - it.delivered) : ''])),
    issueInvoice: invoiceMode || (d.can_issue_invoice && !d.full_invoice),
  });

  const load = async (orderId: string, resetForm = true) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/${orderId}/deliveries`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'โหลดเที่ยวส่งของไม่สำเร็จ');
      setData(json);
      const left = (json.items as TripItem[]).some((it) => it.liters - it.delivered > 0.005);
      if (resetForm) setForm(left && json.order.can_record ? newTripForm(json) : null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setData(null);
    setForm(null);
    setConfirmDelete(null);
    if (order) void load(order.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  const totals = useMemo(() => {
    const all = (data?.items ?? []).reduce((s, it) => s + it.liters, 0);
    const delivered = (data?.items ?? []).reduce((s, it) => s + it.delivered, 0);
    const invoiced = data?.full_invoice ? delivered : (data?.trips ?? []).filter((t) => t.invoice).reduce((s, t) => s + t.total_liters, 0);
    return { all, delivered, invoiced, left: Math.max(0, all - delivered) };
  }, [data]);

  const formLines: TripLine[] = form ? Object.entries(form.liters).map(([id, raw]) => ({ sale_order_item_id: id, liters: parseLiters(raw) })) : [];
  const editingTrip = form?.editingId ? data?.trips.find((t) => t.id === form.editingId) ?? null : null;
  const formError = form && data
    ? validateTripLines(data.items, formLines, data.trips.filter((t) => t.id !== form.editingId))
    : null;

  const save = async () => {
    if (!order || !form || !data) return;
    const when = form.deliveredAt ? new Date(form.deliveredAt) : null;
    if (!when || Number.isNaN(when.getTime())) {
      setError('กรุณาระบุวันเวลาส่งของให้ถูกต้อง');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const body = {
        delivered_at: when.toISOString(),
        lines: formLines,
        vehicle_license_plate: form.plate.trim() || null,
        vehicle_driver_name: form.driver.trim() || null,
        receiver_name: form.receiver.trim() || null,
        note: form.note.trim() || null,
        issue_invoice: !form.editingId && (invoiceMode || form.issueInvoice),
      };
      const url = form.editingId ? `/api/orders/${order.id}/deliveries/${form.editingId}` : `/api/orders/${order.id}/deliveries`;
      const res = await fetch(url, { method: form.editingId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'บันทึกการส่งของไม่สำเร็จ');

      const dr = json.trip?.delivery_record_no || '';
      if (form.editingId) {
        onChanged({ message: `แก้ไขเที่ยวส่ง ${dr} แล้ว`, severity: 'success', advanced: json.advanced });
      } else if (json.invoice) {
        onChanged({
          message: `${invoiceMode ? 'ออกใบกำกับภาษี' : `บันทึกส่งของ ${dr} และออกใบกำกับ`} ${json.invoice.invoice_no} ยอด ${fmt(Number(json.invoice.total_amount || 0), 2)} บาทแล้ว`,
          severity: 'success',
          advanced: json.advanced,
          invoice: { id: json.invoice.id, invoice_no: json.invoice.invoice_no },
        });
      } else if (json.invoice_error) {
        onChanged({ message: `บันทึกส่งของ ${dr} แล้ว แต่ยังไม่ได้ออกใบกำกับ: ${json.invoice_error}`, severity: 'warning', advanced: json.advanced });
      } else {
        onChanged({ message: `บันทึกส่งของ ${dr} แล้ว รอฝ่ายบัญชีออกใบกำกับ`, severity: 'success', advanced: json.advanced });
      }
      await load(order.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const issueInvoice = async (trip: Trip) => {
    if (!order) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/accounting/invoice/from-delivery/${trip.id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'ออกใบกำกับภาษีไม่สำเร็จ');
      onChanged({ message: `ออกใบกำกับ ${json.invoice_no} จาก ${trip.delivery_record_no || `เที่ยวที่ ${trip.trip_no}`} ยอด ${fmt(Number(json.total_amount || 0), 2)} บาทแล้ว`, severity: 'success', invoice: { id: json.id, invoice_no: json.invoice_no } });
      await load(order.id, false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const removeTrip = async (trip: Trip) => {
    if (!order) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/${order.id}/deliveries/${trip.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'ลบเที่ยวส่งไม่สำเร็จ');
      setConfirmDelete(null);
      onChanged({ message: `ลบเที่ยวส่ง ${trip.delivery_record_no || ''} แล้ว ลิตรกลับเป็นคงเหลือ`, severity: 'success' });
      await load(order.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const editTrip = (trip: Trip) => {
    if (!data) return;
    const byItem = new Map(trip.lines.map((l) => [l.sale_order_item_id, l.liters]));
    setForm({
      editingId: trip.id,
      deliveredAt: toLocalInput(trip.delivered_at),
      plate: trip.vehicle_license_plate || '',
      driver: trip.vehicle_driver_name || '',
      receiver: trip.receiver_name || '',
      note: trip.note || '',
      liters: Object.fromEntries(data.items.map((it) => [it.id, byItem.get(it.id) ? fmt(byItem.get(it.id) as number) : ''])),
      issueInvoice: false,
    });
  };

  const productLabel = (trip: Trip) => {
    if (!data) return '';
    const multi = data.items.length > 1;
    return trip.lines
      .map((l) => {
        const item = data.items.find((it) => it.id === l.sale_order_item_id);
        return `${multi && item ? `${item.product_name} ` : ''}${fmt(l.liters)}`;
      })
      .join(' · ');
  };

  const invoiceCell = (trip: Trip) => {
    if (trip.invoice) {
      return (
        <Chip
          size='small'
          color={trip.invoice.status === 'PAID' ? 'success' : 'warning'}
          variant='outlined'
          icon={<ReceiptLong />}
          label={`${trip.invoice.invoice_no}${trip.invoice.status === 'PAID' ? ' · ชำระแล้ว' : ''}`}
          onClick={() => onOpenPdf('tax-invoice', trip.invoice!.id, `ใบแจ้งหนี้/ใบกำกับภาษี · ${trip.invoice!.invoice_no}`)}
        />
      );
    }
    if (data?.full_invoice) return <Typography variant='caption' color='text.secondary'>อยู่ในใบ {data.full_invoice.invoice_no}</Typography>;
    if (!data?.can_issue_invoice) return <Chip size='small' label='รอบัญชีออกใบกำกับ' />;
    return (
      <Button size='small' variant='outlined' disabled={saving} onClick={() => void issueInvoice(trip)}>
        ออกใบกำกับ
      </Button>
    );
  };

  const pct = (n: number) => (totals.all > 0 ? Math.min(100, (n / totals.all) * 100) : 0);
  const busy = saving || loading;

  return (
    <Dialog open={open ?? Boolean(order)} onClose={busy ? undefined : onClose} fullWidth maxWidth='md'>
      <DialogTitle>
        {invoiceMode ? 'ออกใบกำกับภาษีจากใบสั่งขาย' : `เที่ยวส่งของ ${order?.order_no || ''}`}
        {!invoiceMode ? <Typography variant='body2' color='text.secondary'>{order?.customer_name || data?.order.customer_name || '-'}</Typography> : null}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {header}
          {loading && !data ? <LinearProgress /> : null}
          {error ? <Alert severity='error' onClose={() => setError('')}>{error}</Alert> : null}

          {data ? (
            <Box>
              <Stack direction='row' justifyContent='space-between' alignItems='baseline' flexWrap='wrap' gap={1}>
                <Typography sx={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>
                  ส่งแล้ว {fmt(totals.delivered)} / {fmt(totals.all)} ลิตร
                </Typography>
                {totals.left > 0.005
                  ? <Chip size='small' color={totals.delivered ? 'info' : 'default'} label={totals.delivered ? `ส่งบางส่วน · เหลือ ${fmt(totals.left)} ลิตร` : 'ยังไม่ส่ง'} />
                  : <Chip size='small' color='success' label='ส่งครบแล้ว' />}
              </Stack>
              <Box sx={{ position: 'relative', height: 8, borderRadius: 4, bgcolor: 'action.hover', overflow: 'hidden', my: 0.75 }}>
                <Box sx={{ position: 'absolute', inset: 0, width: `${pct(totals.delivered)}%`, bgcolor: 'info.light' }} />
                <Box sx={{ position: 'absolute', inset: 0, width: `${pct(totals.invoiced)}%`, bgcolor: 'success.main' }} />
              </Box>
              <Typography variant='caption' color='text.secondary'>
                ออกใบกำกับแล้ว {fmt(totals.invoiced)} ลิตร · ส่งแล้วรอออกใบ {fmt(Math.max(0, totals.delivered - totals.invoiced))} ลิตร
              </Typography>
            </Box>
          ) : null}

          {data?.full_invoice ? (
            <Alert severity='info'>
              ใบสั่งขายนี้ออกใบกำกับทั้งใบแล้ว ({data.full_invoice.invoice_no}) เที่ยวส่งจะไม่ออกใบแยก ถ้าต้องการออกตามเที่ยว ให้ยกเลิกใบนั้นก่อน
            </Alert>
          ) : null}

          {data && data.trips.length ? (
            <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}>
              <Table size='small' sx={{ minWidth: 640 }}>
                <TableHead>
                  <TableRow sx={{ '& th': { fontWeight: 800, whiteSpace: 'nowrap' } }}>
                    <TableCell>เที่ยว</TableCell>
                    <TableCell>บันทึกการส่ง</TableCell>
                    <TableCell>รถ / ผู้รับ</TableCell>
                    <TableCell align='right'>ลิตร</TableCell>
                    <TableCell>ใบกำกับภาษี</TableCell>
                    <TableCell align='right'>จัดการ</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.trips.map((trip) => (
                    <TableRow key={trip.id} hover selected={form?.editingId === trip.id}>
                      <TableCell sx={{ fontWeight: 800 }}>{trip.trip_no}</TableCell>
                      <TableCell>
                        <Typography variant='body2' sx={{ fontWeight: 700 }}>{trip.delivery_record_no || '-'}</Typography>
                        <Typography variant='caption' color='text.secondary'>{formatDateTime(trip.delivered_at)}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant='body2'>{trip.vehicle_license_plate || '-'}</Typography>
                        <Typography variant='caption' color='text.secondary'>
                          {[trip.vehicle_driver_name, trip.receiver_name ? `รับโดย ${trip.receiver_name}` : null].filter(Boolean).join(' · ') || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell align='right' sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{productLabel(trip)}</TableCell>
                      <TableCell>{invoiceCell(trip)}</TableCell>
                      <TableCell align='right' sx={{ whiteSpace: 'nowrap' }}>
                        <Tooltip title='บันทึกการส่งของ (PDF)'>
                          <IconButton size='small' color='primary' onClick={() => onOpenPdf('delivery-record', trip.id, `บันทึกการส่งของ · ${trip.delivery_record_no || order?.order_no || ''}`)}>
                            <PictureAsPdf fontSize='small' />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={trip.invoice ? 'แก้วันเวลา รถ ผู้รับ (ลิตรแก้ไม่ได้เพราะออกใบกำกับแล้ว)' : 'แก้ไขเที่ยวนี้'}>
                          <IconButton size='small' disabled={busy} onClick={() => editTrip(trip)}><Edit fontSize='small' /></IconButton>
                        </Tooltip>
                        <Tooltip title={trip.invoice ? 'ยกเลิกใบกำกับก่อนจึงลบเที่ยวได้' : 'ลบเที่ยวนี้'}>
                          <span>
                            <IconButton size='small' color='error' disabled={busy || Boolean(trip.invoice)} onClick={() => setConfirmDelete(trip)}><Delete fontSize='small' /></IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : data ? (
            <Typography color='text.secondary' sx={{ textAlign: 'center', py: 1 }}>ยังไม่มีการส่งของ</Typography>
          ) : null}

          {confirmDelete ? (
            <Alert
              severity='warning'
              action={(
                <Stack direction='row' spacing={1}>
                  <Button size='small' onClick={() => setConfirmDelete(null)}>ไม่ลบ</Button>
                  <Button size='small' color='error' variant='contained' disabled={saving} onClick={() => void removeTrip(confirmDelete)}>ลบเที่ยว</Button>
                </Stack>
              )}
            >
              ลบเที่ยวที่ {confirmDelete.trip_no} ({confirmDelete.delivery_record_no}) ลิตรของเที่ยวนี้จะกลับเป็นคงเหลือ
            </Alert>
          ) : null}

          {data && !form && totals.left > 0.005 && data.order.can_record ? (
            <Box>
              <Button startIcon={<Add />} variant='outlined' color='success' onClick={() => setForm(newTripForm(data))}>
                {invoiceMode ? 'ออกใบกำกับจากส่วนที่เหลือ' : `บันทึกส่งเที่ยวที่ ${data.trips.length + 1}`}
              </Button>
            </Box>
          ) : null}
          {data && !data.order.can_record ? (
            <Alert severity='info'>ใบสั่งขายนี้ยังไม่ได้รับการอนุมัติ หรือปิดงาน/ยกเลิกแล้ว จึงบันทึกการส่งของไม่ได้</Alert>
          ) : null}

          {form && data ? (
            <Box sx={{ border: 1, borderColor: form.editingId ? 'warning.main' : 'success.main', borderRadius: 1, p: 2 }}>
              <Stack spacing={1.5}>
                <Typography sx={{ fontWeight: 800 }}>
                  {form.editingId
                    ? `แก้ไขเที่ยวที่ ${editingTrip?.trip_no ?? ''} (${editingTrip?.delivery_record_no ?? ''})`
                    : `${invoiceMode ? 'ออกใบกำกับภาษี' : 'บันทึกส่งของ'} เที่ยวที่ ${data.trips.length + 1}`}
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                  <TextField
                    id='trip-delivered-at'
                    size='small'
                    label={invoiceMode && !form.editingId ? 'วันเวลาส่งของ (= วันที่ใบกำกับ)' : 'วันเวลาส่งของ'}
                    type='datetime-local'
                    required
                    value={form.deliveredAt}
                    onChange={(e) => setForm({ ...form, deliveredAt: e.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                  <TextField id='trip-plate' size='small' label='ทะเบียนรถ' value={form.plate} onChange={(e) => setForm({ ...form, plate: e.target.value })} slotProps={{ htmlInput: { maxLength: 50 } }} />
                  <TextField id='trip-driver' size='small' label='คนขับ' value={form.driver} onChange={(e) => setForm({ ...form, driver: e.target.value })} slotProps={{ htmlInput: { maxLength: 200 } }} />
                  <TextField id='trip-receiver' size='small' label='ชื่อผู้รับของ' value={form.receiver} onChange={(e) => setForm({ ...form, receiver: e.target.value })} slotProps={{ htmlInput: { maxLength: 200 } }} />
                </Box>

                <Box sx={{ border: 1, borderColor: 'divider', borderRadius: 1, p: 1.5 }}>
                  <Stack direction='row' justifyContent='space-between' flexWrap='wrap' gap={1} sx={{ mb: 1 }}>
                    <Typography variant='body2' sx={{ fontWeight: 700 }}>{invoiceMode ? 'ลิตรที่ออกใบกำกับ' : 'ลิตรที่ส่งเที่ยวนี้'}</Typography>
                    {!form.editingId ? <Typography variant='caption' color='text.secondary'>เติมคงเหลือไว้ให้แล้ว แก้ได้</Typography> : null}
                  </Stack>
                  <Stack spacing={1}>
                    {data.items.map((it) => {
                      const ownOnTrip = editingTrip?.lines.find((l) => l.sale_order_item_id === it.id)?.liters ?? 0;
                      const left = it.liters - it.delivered + ownOnTrip;
                      const lockedByInvoice = Boolean(editingTrip?.invoice);
                      return (
                        <Stack key={it.id} direction='row' spacing={1.5} alignItems='center'>
                          <Box sx={{ flex: 1, minWidth: 0 }}>
                            <Typography variant='body2' sx={{ fontWeight: 700 }}>{it.product_name}</Typography>
                            <Typography variant='caption' color='text.secondary'>คงเหลือ {fmt(Math.max(0, left))} จาก {fmt(it.liters)} ลิตร</Typography>
                          </Box>
                          <TextField
                            id={`trip-liters-${it.id}`}
                            size='small'
                            value={form.liters[it.id] ?? ''}
                            placeholder='0'
                            disabled={lockedByInvoice || left <= 0.005}
                            onChange={(e) => setForm({ ...form, liters: { ...form.liters, [it.id]: e.target.value } })}
                            sx={{ width: 150 }}
                            slotProps={{ htmlInput: { inputMode: 'decimal', style: { textAlign: 'right', fontWeight: 700 }, 'aria-label': `ลิตร ${it.product_name}` } }}
                          />
                        </Stack>
                      );
                    })}
                  </Stack>
                </Box>

                <TextField id='trip-note' size='small' label='หมายเหตุ (ถ้ามี)' multiline minRows={1} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} slotProps={{ htmlInput: { maxLength: 1000 } }} />

                {formError ? <Alert severity='error'>{formError}</Alert> : null}

                {invoiceMode && !form.editingId ? (
                  <Alert severity='info' icon={<ReceiptLong />}>
                    ระบบบันทึกการส่งของ (DR) และออกใบกำกับภาษีให้พร้อมกัน วันที่ใบกำกับ = วันที่ส่ง ยอดเงิน = ลิตร × ราคาในใบสั่งขาย
                  </Alert>
                ) : null}
                {!invoiceMode && !form.editingId && data.can_issue_invoice && !data.full_invoice ? (
                  <FormControlLabel
                    sx={{ border: 1, borderColor: 'success.light', bgcolor: 'action.hover', borderRadius: 1, m: 0, pr: 1.5 }}
                    control={<Checkbox id='trip-issue-invoice' color='success' checked={form.issueInvoice} onChange={(e) => setForm({ ...form, issueInvoice: e.target.checked })} />}
                    label={(
                      <Box sx={{ py: 0.75 }}>
                        <Typography variant='body2' sx={{ fontWeight: 700 }}>ออกใบกำกับภาษีเที่ยวนี้ทันที</Typography>
                        <Typography variant='caption' color='text.secondary'>
                          {form.issueInvoice ? 'วันที่ใบกำกับ = วันที่ส่ง ยอดเงิน = ลิตรเที่ยวนี้ × ราคาในใบสั่งขาย' : 'ไม่ติ๊ก: เที่ยวนี้จะไปรอที่หน้าใบกำกับภาษีให้บัญชีออกทีหลัง'}
                        </Typography>
                      </Box>
                    )}
                  />
                ) : null}
                {!form.editingId && !data.can_issue_invoice && !invoiceMode ? (
                  <Typography variant='caption' color='text.secondary'>บันทึกแล้วเที่ยวนี้จะไปรอที่หน้าใบกำกับภาษีให้ฝ่ายบัญชีออกใบ</Typography>
                ) : null}

                <Stack direction='row' spacing={1} justifyContent='flex-end'>
                  {form.editingId || data.trips.length ? <Button onClick={() => setForm(null)} disabled={saving}>ยกเลิกแบบฟอร์ม</Button> : null}
                  <Button
                    variant='contained'
                    color='success'
                    disabled={saving || Boolean(formError) || !form.deliveredAt || (invoiceMode && !form.editingId && (!data.can_issue_invoice || Boolean(data.full_invoice)))}
                    onClick={() => void save()}
                  >
                    {saving ? 'กำลังบันทึก...' : form.editingId ? 'บันทึกการแก้ไข' : invoiceMode ? 'ออกใบกำกับภาษี' : form.issueInvoice && data.can_issue_invoice && !data.full_invoice ? 'บันทึกส่งของ + ออกใบกำกับ' : 'บันทึกส่งของ'}
                  </Button>
                </Stack>
              </Stack>
            </Box>
          ) : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>ปิด</Button>
      </DialogActions>
    </Dialog>
  );
}
