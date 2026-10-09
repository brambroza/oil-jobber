'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, Cancel, PictureAsPdf } from '@mui/icons-material';
import {
  Alert, Autocomplete, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Stack,
  Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import { PdfPreviewDialog, type PdfPreviewTarget } from '@/components/documents/PdfPreviewDialog';
import { ActionSnackbar, type ActionSnackbarSeverity } from '@/components/common/ActionSnackbar';

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

const money = (value: number) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    () => orders.filter((o) => !invoicedOrderIds.has(o.id) && !['DRAFT', 'CANCELLED'].includes(o.order_status)),
    [orders, invoicedOrderIds],
  );
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.invoice_no, r.order_no, r.customer_name].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [rows, search]);

  const issue = async () => {
    if (!issueOrder) return;
    setIssuing(true);
    try {
      const res = await fetch(`/api/accounting/invoice/from-order/${issueOrder.id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ออกใบกำกับภาษีไม่สำเร็จ');
      setIssueOpen(false);
      setIssueOrder(null);
      showSnack(`ออกใบกำกับภาษี ${data.invoice_no} แล้ว`, 'success');
      await load();
      setPdfTarget({ type: 'tax-invoice', id: issueOrder.id, title: `ใบกำกับภาษี · ${data.invoice_no}` });
    } catch (e) {
      showSnack((e as Error).message, 'error');
    } finally {
      setIssuing(false);
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
        <Typography variant='body2' color='text.secondary'>ใบส่งของ / ใบแจ้งหนี้ / ใบกำกับภาษี ออกจากใบสั่งซื้อโดยอัตโนมัติ เลขที่ IV-YYMMDD####</Typography>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField id='invoice-search' size='small' label='ค้นหา เลขที่ / คำสั่งซื้อ / ลูกค้า' value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 280 }} />
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={() => setIssueOpen(true)}>ออกใบกำกับจากใบสั่งซื้อ</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>เลขที่ใบกำกับ</TableCell>
              <TableCell>คำสั่งซื้อ</TableCell>
              <TableCell>ลูกค้า</TableCell>
              <TableCell>วันที่ออก</TableCell>
              <TableCell>ครบกำหนด</TableCell>
              <TableCell align='right'>ก่อน VAT</TableCell>
              <TableCell align='right'>VAT</TableCell>
              <TableCell align='right'>รวมทั้งสิ้น</TableCell>
              <TableCell>สถานะ</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id} hover sx={{ opacity: r.status === 'CANCELLED' ? 0.55 : 1 }}>
                <TableCell sx={{ fontWeight: 800 }}>{r.invoice_no}</TableCell>
                <TableCell>{r.order_no || r.sale_order_id.slice(0, 8)}</TableCell>
                <TableCell>{r.customer_name || '-'}</TableCell>
                <TableCell>{r.issued_at}</TableCell>
                <TableCell>{r.due_date || '-'}</TableCell>
                <TableCell align='right'>{r.subtotal_amount != null ? money(r.subtotal_amount) : '-'}</TableCell>
                <TableCell align='right'>{r.vat_amount != null ? money(r.vat_amount) : '-'}</TableCell>
                <TableCell align='right' sx={{ fontWeight: 900 }}>{money(r.total_amount)}</TableCell>
                <TableCell><Chip size='small' label={statusLabel[r.status]?.label ?? r.status} color={statusLabel[r.status]?.color ?? 'default'} /></TableCell>
                <TableCell align='right' sx={{ whiteSpace: 'nowrap' }}>
                  <Tooltip title='พิมพ์ / ส่ง LINE'>
                    <span>
                      <IconButton size='small' color='primary' disabled={r.status === 'CANCELLED'} onClick={() => setPdfTarget({ type: 'tax-invoice', id: r.sale_order_id, title: `ใบกำกับภาษี · ${r.invoice_no}` })}>
                        <PictureAsPdf fontSize='small' />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title='ยกเลิกใบกำกับ'>
                    <span>
                      <IconButton size='small' color='error' disabled={r.status === 'CANCELLED'} onClick={() => setCancelId(r.id)}>
                        <Cancel fontSize='small' />
                      </IconButton>
                    </span>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && !loading ? <TableRow><TableCell colSpan={10} align='center'>ยังไม่มีใบกำกับภาษี</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Box>

      <Dialog open={issueOpen} onClose={() => setIssueOpen(false)} fullWidth maxWidth='sm'>
        <DialogTitle>ออกใบกำกับภาษีจากใบสั่งซื้อ</DialogTitle>
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
            <Alert severity='info'>ระบบจะคัดลอกรายการ ยอดเงิน ค่าขนส่ง และข้อมูลลูกค้า ณ วันที่ออก และกำหนดเลขที่ให้อัตโนมัติ</Alert>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIssueOpen(false)}>ยกเลิก</Button>
          <Button variant='contained' disabled={!issueOrder || issuing} onClick={() => void issue()}>{issuing ? 'กำลังออก...' : 'ออกใบกำกับ'}</Button>
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

      <PdfPreviewDialog target={pdfTarget} onClose={() => setPdfTarget(null)} onNotify={showSnack} />
      <ActionSnackbar open={snack.open} message={snack.message} severity={snack.severity} onClose={() => setSnack((p) => ({ ...p, open: false }))} />
    </Stack>
  );
}
