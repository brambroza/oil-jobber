'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, DeleteOutline, Sync } from '@mui/icons-material';
import {
  Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Divider, IconButton, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import { VAT_MODE_OPTIONS, parseVatMode, type VatMode } from '@/lib/documents/vat-mode';
import { validateInvoiceIssueDate } from '@/lib/utils/invoice-dates';
import { buildInvoiceContent, type InvoiceItemInput } from '@/lib/utils/invoice-content';
import VatPriceInput from '@/components/orders/VatPriceInput';

export type InvoiceEditTarget = { id: string; invoice_no: string } | null;

type ContentForm = {
  customer_name: string;
  customer_tax_id: string;
  customer_address: string;
  customer_phone: string;
  note: string;
  discount_amount: number;
  items: InvoiceItemInput[];
};

const money = (value: number) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Today's date in Asia/Bangkok as `YYYY-MM-DD`. */
function todayBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * Edits an issued tax invoice: dates, VAT type and the printed content
 * (customer block, lines, discount, note). Content edits are stored on the
 * invoice and printed instead of the sale order; "ดึงข้อมูลล่าสุดจากใบสั่งขาย"
 * goes back to printing the live order.
 */
export default function InvoiceEditDialog({
  target,
  onClose,
  onSaved,
  onNotify,
}: {
  target: InvoiceEditTarget;
  onClose: () => void;
  onSaved: () => void;
  onNotify: (message: string, severity: 'success' | 'error' | 'info' | 'warning') => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [issuedAt, setIssuedAt] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [vatMode, setVatMode] = useState<VatMode>('excl');
  const [content, setContent] = useState<ContentForm | null>(null);
  const [contentDirty, setContentDirty] = useState(false);
  const [edited, setEdited] = useState(false);
  const [orderNo, setOrderNo] = useState('');
  const [orderTotal, setOrderTotal] = useState(0);

  /** Loads the invoice and the content the PDF prints now. */
  const load = async (invoiceId: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/accounting/invoice/${invoiceId}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดใบกำกับภาษีไม่สำเร็จ');
      setIssuedAt(String(data.invoice?.issued_at || '').slice(0, 10));
      setDueDate(String(data.invoice?.due_date || '').slice(0, 10));
      setVatMode(parseVatMode(data.price_vat_mode));
      setEdited(Boolean(data.content_overridden));
      setOrderNo(String(data.order_no || ''));
      setOrderTotal(Number(data.order_total || 0));
      const c = data.content || {};
      setContent({
        customer_name: String(c.customer_name || ''),
        customer_tax_id: String(c.customer_tax_id || ''),
        customer_address: String(c.customer_address || ''),
        customer_phone: String(c.customer_phone || ''),
        note: String(c.note || ''),
        discount_amount: Number(c.discount_amount || 0),
        items: Array.isArray(c.items) ? c.items : [],
      });
      setContentDirty(false);
    } catch (caught) {
      setError((caught as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (target) void load(target.id);
    else setContent(null);
  }, [target?.id]);

  const preview = useMemo(
    () => buildInvoiceContent(content?.items ?? [], content?.discount_amount ?? 0),
    [content],
  );
  const dateError = target
    ? validateInvoiceIssueDate(issuedAt, { today: todayBangkok(), invoiceNo: target.invoice_no, dueDate: dueDate || null })
    : null;
  const itemsError = content
    ? (!content.items.length
      ? 'ต้องมีรายการอย่างน้อย 1 รายการ'
      : content.items.some((it) => !it.product_code.trim() || !it.product_name.trim() || !(Number(it.liters) > 0) || Number(it.unit_price_incl_vat) < 0)
        ? 'ทุกรายการต้องมีรหัส ชื่อสินค้า และจำนวนลิตรมากกว่า 0'
        : null)
    : null;
  const nameError = content && !content.customer_name.trim() ? 'กรุณาระบุชื่อลูกค้า' : null;
  const totalDiffers = Math.abs(preview.totals.net_incl_vat - orderTotal) >= 0.005;

  /** Updates the content form and marks it as edited. */
  const patchContent = (patch: Partial<ContentForm>) => {
    setContent((prev) => (prev ? { ...prev, ...patch } : prev));
    setContentDirty(true);
  };

  /** Updates one line. */
  const patchItem = (index: number, patch: Partial<InvoiceItemInput>) => {
    setContent((prev) => (prev ? { ...prev, items: prev.items.map((it, i) => (i === index ? { ...it, ...patch } : it)) } : prev));
    setContentDirty(true);
  };

  const save = async () => {
    if (!target || !content || dateError || (contentDirty && (itemsError || nameError))) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/accounting/invoice/${target.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          issued_at: issuedAt,
          due_date: dueDate,
          price_vat_mode: vatMode,
          ...(contentDirty ? {
            content: {
              ...content,
              items: content.items.map((it) => ({ ...it, liters: Number(it.liters), unit_price_incl_vat: Number(it.unit_price_incl_vat) })),
              discount_amount: Number(content.discount_amount || 0),
            },
          } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      onNotify(`แก้ไขใบกำกับ ${target.invoice_no} แล้ว`, 'success');
      onSaved();
      onClose();
    } catch (caught) {
      const message = (caught as Error).message;
      setError(message);
      onNotify(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  /** Goes back to printing the live sale order. */
  const refreshFromOrder = async () => {
    if (!target) return;
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/accounting/invoice/${target.id}/refresh`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ดึงข้อมูลจากใบสั่งขายไม่สำเร็จ');
      onNotify(`ดึงข้อมูลล่าสุดจากใบสั่งขายเข้าใบกำกับ ${target.invoice_no} แล้ว`, 'success');
      onSaved();
      await load(target.id);
    } catch (caught) {
      const message = (caught as Error).message;
      setError(message);
      onNotify(message, 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(target)} onClose={saving ? undefined : onClose} fullWidth maxWidth='lg'>
      <DialogTitle>แก้ไขใบกำกับภาษี {target?.invoice_no}{orderNo ? ` · ใบสั่งขาย ${orderNo}` : ''}</DialogTitle>
      <DialogContent dividers>
        {loading || !content ? (
          <Stack alignItems='center' sx={{ py: 4 }}>{error ? <Alert severity='error'>{error}</Alert> : <CircularProgress size={28} />}</Stack>
        ) : (
          <Stack spacing={2}>
            {error ? <Alert severity='error'>{error}</Alert> : null}
            {edited ? (
              <Alert
                severity='info'
                action={<Button size='small' startIcon={<Sync />} onClick={() => void refreshFromOrder()} disabled={saving}>ดึงข้อมูลล่าสุดจากใบสั่งขาย</Button>}
              >
                ใบกำกับนี้ถูกแก้ไขแล้ว PDF พิมพ์ข้อมูลที่แก้ไว้ ไม่ใช่ข้อมูลในใบสั่งขาย
              </Alert>
            ) : (
              <Alert severity='info'>ตอนนี้ใบกำกับพิมพ์ตามใบสั่งขาย ถ้าแก้ลูกค้า รายการ ส่วนลด หรือหมายเหตุ ใบกำกับจะพิมพ์ข้อมูลที่แก้แทน</Alert>
            )}

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-start' }}>
              <TextField
                type='date'
                size='small'
                label='วันที่ออกใบกำกับภาษี'
                value={issuedAt}
                onChange={(e) => setIssuedAt(e.target.value)}
                error={Boolean(dateError)}
                helperText={dateError || ' '}
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayBangkok() } }}
              />
              <TextField
                type='date'
                size='small'
                label='วันครบกำหนดชำระ'
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                helperText=' '
                slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: issuedAt || undefined } }}
              />
            </Stack>

            <Divider textAlign='left'><Typography variant='body2' sx={{ fontWeight: 700 }}>ข้อมูลลูกค้าบนใบกำกับ</Typography></Divider>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField size='small' label='ชื่อลูกค้า' value={content.customer_name} onChange={(e) => patchContent({ customer_name: e.target.value })} error={Boolean(nameError)} helperText={nameError || ' '} fullWidth slotProps={{ htmlInput: { maxLength: 300 } }} />
              <TextField size='small' label='เลขผู้เสียภาษี' value={content.customer_tax_id} onChange={(e) => patchContent({ customer_tax_id: e.target.value })} helperText=' ' sx={{ minWidth: 200 }} slotProps={{ htmlInput: { maxLength: 20 } }} />
              <TextField size='small' label='โทรศัพท์' value={content.customer_phone} onChange={(e) => patchContent({ customer_phone: e.target.value })} helperText=' ' sx={{ minWidth: 160 }} slotProps={{ htmlInput: { maxLength: 50 } }} />
            </Stack>
            <TextField size='small' label='ที่อยู่ (ระบุสำนักงานใหญ่/สาขาได้)' value={content.customer_address} onChange={(e) => patchContent({ customer_address: e.target.value })} multiline minRows={2} fullWidth slotProps={{ htmlInput: { maxLength: 1000 } }} />

            <Divider textAlign='left'/>
            <Box sx={{ overflowX: 'auto' }}>
              <Table size='small'>
                <TableHead>
                  <TableRow>
                    <TableCell>รหัส</TableCell>
                    <TableCell>ชื่อสินค้า</TableCell>
                    <TableCell>แหล่ง/คลัง</TableCell>
                    <TableCell align='right'>ลิตร</TableCell>
                    <TableCell align='right'>
                      <Stack alignItems='flex-end' spacing={0.5}>
                        <span>ราคา/ลิตร</span>
                        <ToggleButtonGroup
                          size='small'
                          exclusive
                          color='primary'
                          value={vatMode}
                          onChange={(_, value: VatMode | null) => { if (value) setVatMode(value); }}
                          aria-label='ประเภทภาษี'
                          sx={{ '& .MuiToggleButton-root': { py: 0.25, px: 1, fontSize: 12, whiteSpace: 'nowrap' } }}
                        >
                          {VAT_MODE_OPTIONS.map((option) => (
                            <ToggleButton key={option.value} value={option.value}>{option.label}</ToggleButton>
                          ))}
                        </ToggleButtonGroup>
                      </Stack>
                    </TableCell>
                    <TableCell align='right'>{vatMode === 'excl' ? 'จำนวนเงิน (ก่อน VAT)' : 'จำนวนเงิน (รวม VAT)'}</TableCell>
                    <TableCell />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {content.items.map((it, index) => (
                    <TableRow key={index}>
                      <TableCell><TextField size='small' value={it.product_code} onChange={(e) => patchItem(index, { product_code: e.target.value })} sx={{ width: 100 }} slotProps={{ htmlInput: { maxLength: 50 } }} /></TableCell>
                      <TableCell><TextField size='small' value={it.product_name} onChange={(e) => patchItem(index, { product_name: e.target.value })} sx={{ minWidth: 180 }} fullWidth slotProps={{ htmlInput: { maxLength: 200 } }} /></TableCell>
                      <TableCell><TextField size='small' value={it.depot_label ?? ''} onChange={(e) => patchItem(index, { depot_label: e.target.value || null })} sx={{ minWidth: 160 }} slotProps={{ htmlInput: { maxLength: 200 } }} /></TableCell>
                      <TableCell align='right'><TextField size='small' type='number' value={it.liters} onChange={(e) => patchItem(index, { liters: Number(e.target.value) })} sx={{ width: 120 }} slotProps={{ htmlInput: { min: 0, step: 1 } }} /></TableCell>
                      <TableCell align='right'>
                        <VatPriceInput
                          unitPriceInclVat={Number(it.unit_price_incl_vat || 0)}
                          mode={vatMode}
                          onChange={(inclVat) => patchItem(index, { unit_price_incl_vat: inclVat })}
                        />
                      </TableCell>
                      <TableCell align='right' sx={{ fontWeight: 700 }}>
                        {money((vatMode === 'excl' ? preview.items[index]?.amount_ex_vat : preview.items[index]?.amount_incl_vat) ?? 0)}
                      </TableCell>
                      <TableCell>
                        <Tooltip title='ลบรายการ'>
                          <span>
                            <IconButton size='small' color='error' disabled={content.items.length <= 1} onClick={() => patchContent({ items: content.items.filter((_, i) => i !== index) })}>
                              <DeleteOutline fontSize='small' />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
            <Box>
              <Button
                size='small'
                startIcon={<Add />}
                disabled={content.items.length >= 50}
                onClick={() => patchContent({ items: [...content.items, { product_code: '', product_name: '', depot_label: null, liters: 0, unit_price_incl_vat: 0 }] })}
              >
                เพิ่มรายการ
              </Button>
              {itemsError && contentDirty ? <Typography variant='caption' color='error' sx={{ ml: 1 }}>{itemsError}</Typography> : null}
            </Box>

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2} alignItems={{ md: 'flex-start' }}>
              <TextField size='small' label='หมายเหตุ (พิมพ์บนใบกำกับ)' value={content.note} onChange={(e) => patchContent({ note: e.target.value })} multiline minRows={2} fullWidth slotProps={{ htmlInput: { maxLength: 1000 } }} />
              <Stack spacing={1} sx={{ minWidth: 280 }}>
                <TextField size='small' type='number' label='ส่วนลดท้ายบิล (รวม VAT)' value={content.discount_amount} onChange={(e) => patchContent({ discount_amount: Number(e.target.value) })} slotProps={{ htmlInput: { min: 0, step: '0.01' } }} />
                <Typography variant='body2'>ยอดก่อน VAT: <b>{money(preview.totals.subtotal_ex_vat)}</b></Typography>
                <Typography variant='body2'>VAT 7%: <b>{money(preview.totals.vat)}</b></Typography>
                <Typography variant='body1'>รวมทั้งสิ้น: <b>{money(preview.totals.net_incl_vat)}</b> บาท</Typography>
              </Stack>
            </Stack>
            {totalDiffers ? (
              <Alert severity='warning'>
                ยอดในใบกำกับ ({money(preview.totals.net_incl_vat)}) ไม่ตรงกับยอดใบสั่งขาย ({money(orderTotal)}) ยอดค้างชำระและการรับชำระยังคิดจากใบสั่งขาย
              </Alert>
            ) : null}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>ปิด</Button>
        <Button
          variant='contained'
          onClick={() => void save()}
          disabled={saving || loading || !content || Boolean(dateError) || (contentDirty && Boolean(itemsError || nameError))}
        >
          {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
