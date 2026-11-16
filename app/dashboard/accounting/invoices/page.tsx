'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, Cancel, ContentCopy, Edit, Payments, PictureAsPdf } from '@mui/icons-material';
import {
  Alert, Autocomplete, Avatar, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Stack,
  Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { PdfPreviewDialog, type PdfPreviewTarget } from '@/components/documents/PdfPreviewDialog';
import { ActionSnackbar, type ActionSnackbarSeverity } from '@/components/common/ActionSnackbar';
import { PaymentDialog, type PaymentDialogOrder } from '@/components/accounting/PaymentDialog';
import { canIssueTaxInvoice } from '@/lib/utils/order-status';
import { groupInvoiceRowsByStatus } from '@/lib/utils/invoice-groups';
import { formatDate } from '@/lib/utils/date-format';
import { validateInvoiceIssueDate } from '@/lib/utils/invoice-dates';
import { parseVatMode, type VatMode } from '@/lib/documents/vat-mode';
import InvoiceEditDialog, { type InvoiceEditTarget } from '@/components/accounting/InvoiceEditDialog';
import { invoiceDocStatus, invoiceDocView, paymentView, type InvoiceDocStatus, type PaymentKind, type StatusTone, type StatusView } from '@/lib/utils/invoice-status-view';

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
type OrderOption = {
  id: string;
  order_no: string | null;
  customer_name: string;
  total_amount: number;
  order_status: string;
  /** Order's own due date (fallback when no invoice yet). */
  due_date: string | null;
  /** Total minus recorded payments (from `/api/orders`). */
  outstanding_amount: number;
  /** ประเภทภาษีของบิล (ราคาไม่รวม/รวมภาษี) */
  price_vat_mode: VatMode;
};

/** Today's date in Asia/Bangkok as `YYYY-MM-DD`. */
function todayBangkok(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

/**
 * First visible character of a customer name for the avatar, skipping common
 * Thai/English company prefixes such as "บริษัท" or "หจก.".
 * @param name - customer company name
 */
function customerInitial(name: string): string {
  const cleaned = String(name || '')
    .replace(/^(บริษัท|บจก\.?|หจก\.?|ห้างหุ้นส่วนจำกัด|ห้างหุ้นส่วนสามัญ|ร้าน)\s*/u, '')
    .trim();
  const ch = Array.from(cleaned.replace(/^[\u0E30-\u0E4E\s]+/u, ''))[0];
  return ch ? ch.toUpperCase() : '?';
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

type DocFilter = 'ALL' | InvoiceDocStatus;
type PayFilter = 'ALL' | 'UNPAID' | PaymentKind;
type FilterOption<T extends string> = { value: T; label: string; tone: StatusTone };

const DOC_FILTERS: FilterOption<DocFilter>[] = [
  { value: 'ALL', label: 'ทั้งหมด', tone: 'neutral' },
  { value: 'NOT_ISSUED', label: 'ยังไม่ออก', tone: 'neutral' },
  { value: 'ISSUED', label: 'ออกแล้ว', tone: 'info' },
  { value: 'CANCELLED', label: 'ยกเลิกแล้ว', tone: 'neutral' },
];

const PAY_FILTERS: FilterOption<PayFilter>[] = [
  { value: 'ALL', label: 'ทั้งหมด', tone: 'neutral' },
  { value: 'UNPAID', label: 'ค้างชำระทั้งหมด', tone: 'warning' },
  { value: 'OVERDUE', label: 'เกินกำหนด', tone: 'error' },
  { value: 'DUE_TODAY', label: 'ครบกำหนดวันนี้', tone: 'warning' },
  { value: 'PENDING', label: 'รอชำระ', tone: 'neutral' },
  { value: 'PARTIAL', label: 'ชำระบางส่วน', tone: 'info' },
  { value: 'PAID', label: 'ชำระครบ', tone: 'success' },
];

/**
 * One labelled row of selectable filter pills with a count badge each.
 * @param label - row caption
 * @param options - filter options in display order
 * @param value - selected option
 * @param counts - rows per option value
 * @param onChange - called with the picked option
 */
function FilterRow<T extends string>({ label, options, value, counts, onChange }: {
  label: string;
  options: FilterOption<T>[];
  value: T;
  counts: Record<string, number>;
  onChange: (next: T) => void;
}) {
  return (
    <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 0.5, md: 1.5 }} alignItems={{ md: 'center' }}>
      <Typography variant='caption' sx={{ fontWeight: 800, color: 'text.secondary', minWidth: 92 }}>{label}</Typography>
      <Stack direction='row' spacing={0.75} useFlexGap flexWrap='wrap'>
        {options.map((opt) => {
          const selected = opt.value === value;
          const c = TONE_COLORS[opt.tone];
          const count = counts[opt.value] ?? 0;
          return (
            <Box
              key={opt.value}
              component='button'
              type='button'
              onClick={() => onChange(opt.value)}
              aria-pressed={selected}
              sx={{
                display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1.25, py: 0.5, borderRadius: 999,
                border: '1px solid', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 700,
                borderColor: selected ? c.dot : 'divider',
                bgcolor: selected ? c.bg : 'background.paper',
                color: selected ? c.fg : 'text.secondary',
                opacity: count || selected ? 1 : 0.55,
                transition: 'all .15s',
                '&:hover': { borderColor: c.dot, color: c.fg },
                '&:focus-visible': { outline: `2px solid ${c.dot}`, outlineOffset: 1 },
              }}
            >
              {opt.value !== 'ALL' ? <Box component='span' sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: c.dot }} /> : null}
              {opt.label}
              <Box component='span' sx={{ minWidth: 20, px: 0.6, borderRadius: 999, fontSize: 11.5, lineHeight: '18px', textAlign: 'center', bgcolor: selected ? '#fff' : '#f1f5f9', color: selected ? c.fg : 'text.secondary' }}>
                {count}
              </Box>
            </Box>
          );
        })}
      </Stack>
    </Stack>
  );
}

/**
 * Amount block: grand total on top, then a small before-VAT / VAT breakdown.
 * @param total - grand total incl. VAT
 * @param subtotal - amount before VAT (null when no invoice yet)
 * @param vat - VAT amount (null when no invoice yet)
 * @param fromOrder - true when no active invoice; the total comes from the sale order
 */
function AmountCell({ total, subtotal, vat, fromOrder }: { total: number; subtotal: number | null; vat: number | null; fromOrder: boolean }) {
  const hasBreakdown = subtotal != null && vat != null;
  return (
    <Stack spacing={0.25} alignItems='flex-end'>
      <Typography sx={{ fontWeight: 800, fontSize: 15, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums', color: fromOrder ? 'text.secondary' : 'text.primary' }}>
        {money(total)}
      </Typography>
      {hasBreakdown ? (
        <Box
          sx={{
            display: 'grid', gridTemplateColumns: 'auto auto', columnGap: 1, rowGap: 0,
            fontSize: 11.5, lineHeight: 1.45, color: 'text.secondary', fontVariantNumeric: 'tabular-nums',
            '& > :nth-of-type(odd)': { textAlign: 'left', color: 'text.disabled' },
            '& > :nth-of-type(even)': { textAlign: 'right' },
          }}
        >
          <span>ก่อน VAT</span><span>{money(subtotal)}</span>
          <span>VAT</span><span>{money(vat)}</span>
        </Box>
      ) : (
        <Typography variant='caption' color='text.disabled' sx={{ fontSize: 11.5 }}>
          {fromOrder ? 'ยอดตามใบสั่งขาย' : 'รวม VAT'}
        </Typography>
      )}
    </Stack>
  );
}

/** Text / background / dot colors per status tone. */
const TONE_COLORS: Record<StatusTone, { fg: string; bg: string; dot: string }> = {
  neutral: { fg: '#475569', bg: '#f1f5f9', dot: '#94a3b8' },
  info: { fg: '#1d4ed8', bg: '#eff6ff', dot: '#3b82f6' },
  success: { fg: '#047857', bg: '#ecfdf5', dot: '#10b981' },
  warning: { fg: '#b45309', bg: '#fffbeb', dot: '#f59e0b' },
  error: { fg: '#b91c1c', bg: '#fef2f2', dot: '#ef4444' },
};

/**
 * Soft pill with a colored dot plus an optional caption line under it.
 * @param view - label, detail and tone from `lib/utils/invoice-status-view`
 * @param strike - strike through the label (cancelled documents)
 */
function StatusPill({ view, strike }: { view: StatusView; strike?: boolean }) {
  const c = TONE_COLORS[view.tone];
  return (
    <Stack spacing={0.25} alignItems='flex-start'>
      <Box
        component='span'
        sx={{
          display: 'inline-flex', alignItems: 'center', gap: 0.75, px: 1, py: 0.25, borderRadius: 999,
          bgcolor: c.bg, color: c.fg, fontSize: 12.5, fontWeight: 700, whiteSpace: 'nowrap',
          textDecoration: strike ? 'line-through' : 'none',
        }}
      >
        <Box component='span' sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: c.dot, flexShrink: 0 }} />
        {view.label}
      </Box>
      {view.detail ? <Typography variant='caption' color='text.secondary' sx={{ whiteSpace: 'nowrap', pl: 0.5 }}>{view.detail}</Typography> : null}
    </Stack>
  );
}

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
  /** ใบกำกับที่กำลังแก้ไข */
  const [editTarget, setEditTarget] = useState<InvoiceEditTarget>(null);
  /** ตัวกรองสถานะใบกำกับ */
  const [docFilter, setDocFilter] = useState<DocFilter>('ALL');
  /** ตัวกรองสถานะชำระ */
  const [payFilter, setPayFilter] = useState<PayFilter>('ALL');
  /** หน้าปัจจุบันของตาราง (เริ่มที่ 0) */
  const [page, setPage] = useState(0);
  /** จำนวนแถวต่อหน้า; -1 = ทั้งหมด */
  const [rowsPerPage, setRowsPerPage] = useState(10);
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
        due_date: o.due_date ? String(o.due_date) : null,
        outstanding_amount: Number(o.outstanding_amount ?? o.total_amount ?? 0),
        price_vat_mode: parseVatMode(o.price_vat_mode),
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
  /**
   * Orders CONFIRMED onwards paired with their invoice, filtered by the search box,
   * sorted by invoice issue date then invoice number (newest first); orders without
   * an active invoice go last.
   */
  const searchedRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matches = (o: OrderOption) => {
      if (!q) return true;
      const inv = rows.filter((r) => r.sale_order_id === o.id).map((r) => r.invoice_no);
      return [o.order_no, o.customer_name, ...inv].some((v) => String(v || '').toLowerCase().includes(q));
    };
    const activeOf = (r: InvoiceRow | null) => (r && r.status !== 'CANCELLED' ? r : null);
    return groupInvoiceRowsByStatus(orders.filter(matches), rows)
      .flatMap((g) => g.rows)
      .sort((a, b) => {
        const ia = activeOf(a.invoice);
        const ib = activeOf(b.invoice);
        if (!ia || !ib) return ia ? -1 : ib ? 1 : 0;
        const byDate = String(ib.issued_at || '').localeCompare(String(ia.issued_at || ''));
        if (byDate) return byDate;
        return ib.invoice_no.localeCompare(ia.invoice_no, undefined, { numeric: true });
      })
      .map(({ order, invoice }) => {
        const active = activeOf(invoice);
        return {
          order,
          invoice,
          docStatus: invoiceDocStatus(invoice?.status),
          payView: paymentView({
            order_status: order.order_status,
            due_date: active?.due_date ?? order.due_date,
            total_amount: active ? active.total_amount : order.total_amount,
            outstanding_amount: order.outstanding_amount,
            invoice_paid: active?.status === 'PAID',
          }, todayBangkok()),
        };
      });
  }, [orders, rows, search]);

  /** Row counts per filter option, after the search box but before the status filters. */
  const filterCounts = useMemo(() => {
    const doc: Record<string, number> = { ALL: searchedRows.length };
    const pay: Record<string, number> = { ALL: searchedRows.length };
    for (const row of searchedRows) {
      doc[row.docStatus] = (doc[row.docStatus] ?? 0) + 1;
      if (row.payView) pay[row.payView.kind] = (pay[row.payView.kind] ?? 0) + 1;
      if (row.payView && row.payView.kind !== 'PAID') pay.UNPAID = (pay.UNPAID ?? 0) + 1;
    }
    return { doc, pay };
  }, [searchedRows]);

  /** Rows after the search box and both status filters. */
  const tableRows = useMemo(
    () => searchedRows.filter((row) => {
      if (docFilter !== 'ALL' && row.docStatus !== docFilter) return false;
      if (payFilter === 'ALL') return true;
      if (!row.payView) return false;
      return payFilter === 'UNPAID' ? row.payView.kind !== 'PAID' : row.payView.kind === payFilter;
    }),
    [searchedRows, docFilter, payFilter],
  );

  /** Rows on the current page (`rowsPerPage === -1` shows every row). */
  const pagedRows = useMemo(
    () => (rowsPerPage === -1 ? tableRows : tableRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)),
    [tableRows, page, rowsPerPage],
  );
  // Back to the first page when the search changes; clamp when rows shrink below the current page.
  useEffect(() => { setPage(0); }, [search, docFilter, payFilter]);
  useEffect(() => {
    if (rowsPerPage === -1) return;
    const lastPage = Math.max(0, Math.ceil(tableRows.length / rowsPerPage) - 1);
    if (page > lastPage) setPage(lastPage);
  }, [tableRows.length, rowsPerPage, page]);

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
      <Paper variant='outlined' sx={{ p: 1.5, position: 'relative', zIndex: 0 }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
          <TextField id='invoice-search' size='small' label='ค้นหา เลขที่ / คำสั่งซื้อ / ลูกค้า' value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 280, flex: { sm: 1 }, maxWidth: { sm: 420 } }} />
          <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
          <Box sx={{ flex: 1, display: { xs: 'none', sm: 'block' } }} />
          <Button variant='contained' startIcon={<Add />} onClick={() => { setIssueDate(todayBangkok()); setIssueOpen(true); }}>ออกใบกำกับจากใบสั่งขาย</Button>
        </Stack>
        <Stack spacing={1} sx={{ mt: 1.5, pt: 1.5, borderTop: '1px dashed', borderColor: 'divider' }}>
          <FilterRow label='สถานะใบกำกับ' options={DOC_FILTERS} value={docFilter} counts={filterCounts.doc} onChange={setDocFilter} />
          <FilterRow label='สถานะชำระ' options={PAY_FILTERS} value={payFilter} counts={filterCounts.pay} onChange={setPayFilter} />
        </Stack>
      </Paper>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <TableContainer component={Paper} variant='outlined' sx={{ maxHeight: 'calc(100vh - 340px)', minHeight: 320, overflow: 'auto' }}>
        <Table size='small' stickyHeader sx={{ minWidth: 1280 }}>
          <TableHead>
            <TableRow sx={{ '& th': { whiteSpace: 'nowrap', fontWeight: 800, bgcolor: '#f8fafc', zIndex: 2 } }}>
              <TableCell>วันที่ใบกำกับ</TableCell>
              <TableCell>เลขที่ใบกำกับ</TableCell>
              <TableCell>ลูกค้า</TableCell>
              <TableCell>ครบกำหนด</TableCell>
              <TableCell align='right'>ยอดเงิน (บาท)</TableCell>
              <TableCell>สถานะใบกำกับ</TableCell>
              <TableCell>สถานะชำระ</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedRows.map(({ order: o, invoice: r, docStatus, payView }) => {
                  const active = r && r.status !== 'CANCELLED' ? r : null;
                  return (
                    <TableRow key={o.id} hover>
                      <TableCell>{formatDate(active?.issued_at)}</TableCell>
                      <TableCell sx={{ fontWeight: 800, color: active ? 'text.primary' : 'text.disabled' }}>
                        <Tooltip title={`ใบสั่งขาย ${o.order_no || o.id.slice(0, 8)}`}>
                          <span>{r?.invoice_no || '-'}</span>
                        </Tooltip>
                      </TableCell>
                      <TableCell sx={{ minWidth: 220 }}>
                        <Stack direction='row' spacing={1.25} alignItems='center'>
                          <Avatar sx={{ width: 32, height: 32, fontSize: 14, fontWeight: 800, bgcolor: '#e0e7ff', color: '#3730a3' }}>
                            {customerInitial(o.customer_name)}
                          </Avatar>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography variant='body2' sx={{ fontWeight: 700, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }} title={o.customer_name}>
                              {o.customer_name}
                            </Typography>
                            <Typography variant='caption' color='text.secondary' sx={{ lineHeight: 1.2 }}>
                              ใบสั่งขาย {o.order_no || o.id.slice(0, 8)}
                            </Typography>
                          </Box>
                        </Stack>
                      </TableCell>
                      <TableCell>{formatDate(active?.due_date ?? o.due_date)}</TableCell>
                      <TableCell align='right' sx={{ minWidth: 190 }}>
                        <AmountCell
                          total={active ? active.total_amount : o.total_amount}
                          subtotal={active?.subtotal_amount ?? null}
                          vat={active?.vat_amount ?? null}
                          fromOrder={!active}
                        />
                      </TableCell>
                      <TableCell>
                        <StatusPill view={invoiceDocView(docStatus)} />
                      </TableCell>
                      <TableCell>
                        {payView ? <StatusPill view={payView} /> : '-'}
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
                            <Tooltip title='แก้ไขใบกำกับภาษี'>
                              <IconButton
                                size='small'
                                onClick={() => setEditTarget({ id: active.id, invoice_no: active.invoice_no })}
                              >
                                <Edit fontSize='small' />
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
            {!tableRows.length && !loading ? (
              <TableRow>
                <TableCell colSpan={8} align='center' sx={{ py: 4, color: 'text.secondary' }}>
                  {searchedRows.length ? (
                    <>ไม่มีรายการตามตัวกรองที่เลือก · <Button size='small' onClick={() => { setDocFilter('ALL'); setPayFilter('ALL'); }}>ล้างตัวกรอง</Button></>
                  ) : 'ไม่มีใบสั่งขายที่ยืนยันแล้ว'}
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        component='div'
        count={tableRows.length}
        page={page}
        onPageChange={(_, next) => setPage(next)}
        rowsPerPage={rowsPerPage}
        onRowsPerPageChange={(e) => { setRowsPerPage(Number(e.target.value)); setPage(0); }}
        rowsPerPageOptions={[10, 15, 20, { label: 'ทั้งหมด', value: -1 }]}
        labelRowsPerPage='แถวต่อหน้า'
        labelDisplayedRows={({ from, to, count }) => `${from}–${to} จาก ${count}`}
        sx={{ mt: '0 !important', bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderTop: 0, borderRadius: '0 0 4px 4px' }}
      />

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

      <InvoiceEditDialog
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => { void load(); }}
        onNotify={showSnack}
      />

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
