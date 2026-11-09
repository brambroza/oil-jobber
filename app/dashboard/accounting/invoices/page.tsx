'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Add, Cancel, ContentCopy, EditCalendar, Payments, PictureAsPdf } from '@mui/icons-material';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { PdfPreviewDialog, type PdfPreviewTarget } from '@/components/documents/PdfPreviewDialog';
import { ActionSnackbar, type ActionSnackbarSeverity } from '@/components/common/ActionSnackbar';
import { PaymentDialog, type PaymentDialogOrder } from '@/components/accounting/PaymentDialog';
import { canIssueTaxInvoice, statusColor, statusThai } from '@/lib/utils/order-status';
import { groupInvoiceRowsByStatus } from '@/lib/utils/invoice-groups';
import { formatDate } from '@/lib/utils/date-format';
import { validateInvoiceIssueDate } from '@/lib/utils/invoice-dates';

type InvoiceRow = {
  id: string;
  sale_order_id: string;
  order_no: string | null;
  invoice_no: string;
  issued_at: string;
  due_date: string | null;
  status: 'ISSUED' | 'PAID' | 'CANCELLED';
  customer_name: string | null;
  total_amount: number;
  subtotal_amount: number | null;
  vat_amount: number | null;
};
type OrderOption = { id: string; order_no: string | null; customer_name: string; total_amount: number; order_status: string };

/** Today's date in Asia/Bangkok as `YYYY-MM-DD`. */
function todayBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

const money = (value: number) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Order statuses that can no longer take a payment (not started, cancelled or fully paid). */
const NON_PAYABLE_ORDER_STATUSES = ['DRAFT', 'CANCELLED', 'PAID', 'COMPLETED'];

/**
 * Whether the รับชำระเงิน button shows for a row: the order still owes money
 * and its active tax invoice (if any) is not marked paid yet.
 * @param orderStatus - `sale_orders.order_status`
 * @param invoiceStatus - status of the order's latest invoice, if any
 */
function canReceivePayment(orderStatus: string, invoiceStatus?: InvoiceRow['status'] | null): boolean {
  return !NON_PAYABLE_ORDER_STATUSES.includes(orderStatus) && invoiceStatus !== 'PAID';
}

const statusLabel: Record<InvoiceRow['status'], { label: string; color: 'success' | 'warning' | 'default' }> = {
  ISSUED: { label: 'ออกแล้ว รอชำระ', color: 'warning' },
  PAID: { label: 'ชำระแล้ว', color: 'success' },
  CANCELLED: { label: 'ยกเลิก', color: 'default' },
};

/** Tax invoices issued from orders; manual typing is gone. */
export default function InvoicesPage() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [issueOpen, setIssueOpen] = useState(false);
  const [issueOrder, setIssueOrder] = useState<OrderOption | null>(null);
  const [issuing, setIssuing] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [pdfTarget, setPdfTarget] = useState<PdfPreviewTarget>(null);
  const [paymentOrder, setPaymentOrder] = useState<PaymentDialogOrder | null>(null);
  /** วันที่ออกใบกำกับใน dialog ออกใบกำกับ */
  const [issueDate, setIssueDate] = useState(todayBangkok());
  /** ใบกำกับที่กำลังแก้วันที่ */
  const [dateEdit, setDateEdit] = useState<{ id: string; invoice_no: string; issued_at: string; due_date: string } | null>(null);
  const [savingDates, setSavingDates] = useState(false);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: ActionSnackbarSeverity }>({ open: false, message: '', severity: 'info' });
  const showSnack = (message: string, severity: ActionSnackbarSeverity) => setSnack({ open: true, message, severity });

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [invRes, orderRes] = await Promise.all([
        fetch('/api/accounting/invoice', { cache: 'no-store' }),
        fetch('/api/orders', { cache: 'no-store' }),
      ]);
      const [invData, orderData] = await Promise.all([invRes.json(), orderRes.json()]);
      if (!invRes.ok) throw new Error(invData.error || 'โหลดใบกำกับไม่สำเร็จ');
      if (!orderRes.ok) throw new Error(orderData.error || 'โหลดคำสั่งซื้อไม่สำเร็จ');
      setRows(invData);
      setOrders((orderData || []).map((o: any) => ({
        id: o.id,
        order_no: o.order_no,
        customer_name: o.customers?.company_name || '-',
        total_amount: Number(o.total_amount || 0),
        order_status: String(o.order_status || ''),
      })));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const invoicedOrderIds = useMemo(() => new Set(rows.filter((r) => r.status !== 'CANCELLED').map((r) => r.sale_order_id)), [rows]);
  const issuableOrders = useMemo(
    () => orders.filter((o) => !invoicedOrderIds.has(o.id) && canIssueTaxInvoice(o.order_status)),
    [orders, invoicedOrderIds],
  );
  /** Orders CONFIRMED onwards grouped by order status, filtered by the search box. */
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (o: OrderOption) => {
      if (!q) return true;
      const inv = rows.filter((r) => r.sale_order_id === o.id).map((r) => r.invoice_no);
      return [o.order_no, o.customer_name, ...inv].some((v) => String(v || '').toLowerCase().includes(q));
    };
    return groupInvoiceRowsByStatus(orders.filter(matches), rows);
  }, [orders, rows, search]);
  const visibleCount = groups.reduce((sum, g) => sum + g.rows.length, 0);

  /**
   * Issues a tax invoice from an order.
   * @param target - order to invoice (defaults to the one picked in the dialog)
   * @param issuedAt - issue date `YYYY-MM-DD` (defaults to today)
   */
  const issue = async (target: OrderOption | null = issueOrder, issuedAt: string = todayBangkok()) => {
    if (!target) return;
    setIssuing(true);
    try {
      const res = await fetch(`/api/accounting/invoice/from-order/${target.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issued_at: issuedAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ออกใบกำกับภาษีไม่สำเร็จ');
      setIssueOpen(false);
      setIssueOrder(null);
      showSnack(`ออกใบกำกับภาษี ${data.invoice_no} แล้ว`, 'success');
      await load();
      setPdfTarget({ type: 'tax-invoice', id: target.id, title: `ใบแจ้งหนี้/ใบกำกับภาษี · ${data.invoice_no}` });
    } catch (e) {
      showSnack((e as Error).message, 'error');
    } finally {
      setIssuing(false);
    }
  };

  const issueDateError = issueOpen ? validateInvoiceIssueDate(issueDate, { today: todayBangkok() }) : null;
  const dateEditError = dateEdit
    ? validateInvoiceIssueDate(dateEdit.issued_at, { today: todayBangkok(), invoiceNo: dateEdit.invoice_no, dueDate: dateEdit.due_date || null })
    : null;

  /** Saves the issue date / due date of an issued invoice. */
  const saveDates = async () => {
    if (!dateEdit || dateEditError) return;
    setSavingDates(true);
    try {
      const res = await fetch(`/api/accounting/invoice/${dateEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issued_at: dateEdit.issued_at, due_date: dateEdit.due_date }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'แก้ไขวันที่ไม่สำเร็จ');
      showSnack(`แก้ไขวันที่ใบกำกับ ${dateEdit.invoice_no} แล้ว`, 'success');
      setDateEdit(null);
      await load();
    } catch (e) {
      showSnack((e as Error).message, 'error');
    } finally {
      setSavingDates(false);
    }
  };

  const cancelInvoice = async () => {
    if (!cancelId) return;
    const res = await fetch(`/api/accounting/invoice/${cancelId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'CANCELLED' }),
    });
    const data = await res.json();
    if (!res.ok) showSnack(data.error || 'ยกเลิกไม่สำเร็จ', 'error');
    else showSnack('ยกเลิกใบกำกับภาษีแล้ว สามารถออกใหม่จากคำสั่งซื้อเดิมได้', 'success');
    setCancelId(null);
    await load();
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant='h4'>ใบกำกับภาษี</Typography>
        </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField id='invoice-search' size='small' label='ค้นหา เลขที่ / คำสั่งซื้อ / ลูกค้า' value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 280 }} />
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={() => { setIssueDate(todayBangkok()); setIssueOpen(true); }}>ออกใบกำกับจากใบสั่งขาย</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>คำสั่งซื้อ</TableCell>
              <TableCell>ลูกค้า</TableCell>
              <TableCell>เลขที่ใบกำกับ</TableCell>
              <TableCell>วันที่ออก</TableCell>
              <TableCell>ครบกำหนด</TableCell>
              <TableCell align='right'>ก่อน VAT</TableCell>
              <TableCell align='right'>VAT</TableCell>
              <TableCell align='right'>รวมทั้งสิ้น</TableCell>
              <TableCell>สถานะใบกำกับ</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groups.map((group) => (
              <Fragment key={group.status}>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell colSpan={10} sx={{ py: 0.75 }}>
                    <Stack direction='row' spacing={1} alignItems='center'>
                      <Chip size='small' label={statusThai(group.status)} color={statusColor(group.status)} />
                      <Typography variant='body2' color='text.secondary'>
                        {group.rows.length} รายการ · ออกใบกำกับแล้ว {group.rows.filter((r) => r.invoice && r.invoice.status !== 'CANCELLED').length}
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>
                {group.rows.map(({ order: o, invoice: r }) => {
                  const active = r && r.status !== 'CANCELLED' ? r : null;
                  return (
                    <TableRow key={o.id} hover>
                      <TableCell>{o.order_no || o.id.slice(0, 8)}</TableCell>
                      <TableCell>{o.customer_name}</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: active ? 'text.primary' : 'text.disabled' }}>{r?.invoice_no || '-'}</TableCell>
                      <TableCell>{formatDate(active?.issued_at)}</TableCell>
                      <TableCell>{formatDate(active?.due_date)}</TableCell>
                      <TableCell align='right'>{active?.subtotal_amount != null ? money(active.subtotal_amount) : '-'}</TableCell>
                      <TableCell align='right'>{active?.vat_amount != null ? money(active.vat_amount) : '-'}</TableCell>
                      <TableCell align='right' sx={{ fontWeight: 900 }}>{money(active ? active.total_amount : o.total_amount)}</TableCell>
                      <TableCell>
                        {r ? <Chip size='small' label={statusLabel[r.status]?.label ?? r.status} color={statusLabel[r.status]?.color ?? 'default'} /> : <Chip size='small' variant='outlined' label='ยังไม่ออก' />}
                      </TableCell>
                      <TableCell align='right' sx={{ whiteSpace: 'nowrap' }}>
                        {canReceivePayment(o.order_status, active?.status) ? (
                          <Tooltip title='รับชำระเงิน'>
                            <IconButton
                              size='small'
                              color='success'
                              onClick={() => setPaymentOrder({ sale_order_id: o.id, order_no: o.order_no, customer_name: o.customer_name, total_amount: active ? active.total_amount : o.total_amount })}
                            >
                              <Payments fontSize='small' />
                            </IconButton>
                          </Tooltip>
                        ) : null}
                        {active ? (
                          <>
                            <Tooltip title='ใบแจ้งหนี้/ใบกำกับภาษี (ต้นฉบับ) · พิมพ์ / ส่ง LINE'>
                              <IconButton size='small' color='primary' onClick={() => setPdfTarget({ type: 'tax-invoice', id: o.id, title: `ใบแจ้งหนี้/ใบกำกับภาษี · ${active.invoice_no}` })}>
                                <PictureAsPdf fontSize='small' />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title='แก้ไขวันที่ออก / วันครบกำหนด'>
                              <IconButton
                                size='small'
                                onClick={() => setDateEdit({ id: active.id, invoice_no: active.invoice_no, issued_at: String(active.issued_at || '').slice(0, 10), due_date: String(active.due_date || '').slice(0, 10) })}
                              >
                                <EditCalendar fontSize='small' />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title='สำเนาใบกำกับภาษี'>
                              <IconButton size='small' color='secondary' onClick={() => setPdfTarget({ type: 'tax-invoice', id: o.id, title: `สำเนาใบกำกับภาษี · ${active.invoice_no}`, copy: true })}>
                                <ContentCopy fontSize='small' />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title='ยกเลิกใบกำกับ'>
                              <IconButton size='small' color='error' onClick={() => setCancelId(active.id)}>
                                <Cancel fontSize='small' />
                              </IconButton>
                            </Tooltip>
                          </>
                        ) : (
                          <Button size='small' variant='outlined' startIcon={<Add />} disabled={issuing} onClick={() => void issue(o)}>ออกใบกำกับ</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </Fragment>
            ))}
            {!visibleCount && !loading ? <TableRow><TableCell colSpan={10} align='center'>ไม่มีใบสั่งขายที่ยืนยันแล้ว</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Box>

      <Dialog open={issueOpen} onClose={() => setIssueOpen(false)} fullWidth maxWidth='sm'>
        <DialogTitle>ออกใบกำกับภาษีจากใบสั่งขาย</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Autocomplete
              options={issuableOrders}
              value={issueOrder}
              onChange={(_, value) => setIssueOrder(value)}
              getOptionLabel={(o) => `${o.order_no || o.id.slice(0, 8)} · ${o.customer_name} · ${money(o.total_amount)} บาท`}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText='ไม่มีคำสั่งซื้อที่ยังไม่ได้ออกใบกำกับ'
              renderInput={(params) => <TextField {...params} label='เลือกคำสั่งซื้อ' autoFocus />}
            />
            <TextField
              type='date'
              size='small'
              label='วันที่ออกใบกำกับภาษี'
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              error={Boolean(issueDateError)}
              helperText={issueDateError || 'แก้ย้อนหลังได้ภายในปีเดียวกัน'}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayBangkok() } }}
            />
            <Alert severity='info'>ระบบจะคัดลอกรายการ ยอดเงิน ค่าขนส่ง และข้อมูลลูกค้า ณ วันที่ออก และกำหนดเลขที่ให้อัตโนมัติ</Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssueOpen(false)}>ยกเลิก</Button>
          <Button variant='contained' disabled={!issueOrder || issuing || Boolean(issueDateError)} onClick={() => void issue(issueOrder, issueDate)}>{issuing ? 'กำลังออก...' : 'ออกใบกำกับ'}</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(dateEdit)} onClose={savingDates ? undefined : () => setDateEdit(null)} fullWidth maxWidth='xs'>
        <DialogTitle>แก้ไขวันที่ใบกำกับ {dateEdit?.invoice_no}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              type='date'
              size='small'
              label='วันที่ออกใบกำกับภาษี'
              value={dateEdit?.issued_at ?? ''}
              onChange={(e) => setDateEdit((p) => (p ? { ...p, issued_at: e.target.value } : p))}
              error={Boolean(dateEditError)}
              helperText={dateEditError || 'วันที่นี้พิมพ์บนใบแจ้งหนี้/ใบกำกับภาษี และใบส่งของ'}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayBangkok() } }}
            />
            <TextField
              type='date'
              size='small'
              label='วันครบกำหนดชำระ'
              value={dateEdit?.due_date ?? ''}
              onChange={(e) => setDateEdit((p) => (p ? { ...p, due_date: e.target.value } : p))}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: dateEdit?.issued_at || undefined } }}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDateEdit(null)} disabled={savingDates}>ปิด</Button>
          <Button variant='contained' onClick={() => void saveDates()} disabled={savingDates || Boolean(dateEditError)}>
            {savingDates ? 'กำลังบันทึก...' : 'บันทึก'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(cancelId)} onClose={() => setCancelId(null)}>
        <DialogTitle>ยกเลิกใบกำกับภาษี</DialogTitle>
        <DialogContent>ใบกำกับนี้จะถูกทำเครื่องหมายยกเลิก และสามารถออกใบใหม่จากคำสั่งซื้อเดิมได้ ต้องการดำเนินการใช่หรือไม่</DialogContent>
        <DialogActions>
          <Button onClick={() => setCancelId(null)}>ปิด</Button>
          <Button color='error' onClick={() => void cancelInvoice()}>ยกเลิกใบกำกับ</Button>
        </DialogActions>
      </Dialog>

      <PaymentDialog
        order={paymentOrder}
        onClose={() => setPaymentOrder(null)}
        onSaved={(result) => {
          showSnack(result.receipt_no ? `บันทึกรับชำระแล้ว ออกใบเสร็จ ${result.receipt_no}` : 'อัปเดตการรับชำระแล้ว', 'success');
          void load();
        }}
        onPrintReceipt={(receiptId, receiptNo) => setPdfTarget({ type: 'receipt', id: receiptId, title: `ใบเสร็จรับเงิน · ${receiptNo}` })}
      />
      <PdfPreviewDialog target={pdfTarget} onClose={() => setPdfTarget(null)} onNotify={showSnack} />
      <ActionSnackbar open={snack.open} message={snack.message} severity={snack.severity} onClose={() => setSnack((p) => ({ ...p, open: false }))} />
    </Stack>
  );
}
