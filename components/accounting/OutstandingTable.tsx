'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Chip, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { Payments, PictureAsPdf } from '@mui/icons-material';
import { PaymentDialog, type PaymentDialogOrder } from '@/components/accounting/PaymentDialog';
import { PdfPreviewDialog, type PdfPreviewTarget } from '@/components/documents/PdfPreviewDialog';
import { ActionSnackbar, type ActionSnackbarSeverity } from '@/components/common/ActionSnackbar';
import { formatDate } from '@/lib/utils/date-format';

export type OutstandingRow = {
  sale_order_id: string;
  order_no: string | null;
  customer_id: string;
  customer_name: string;
  sales_user_name: string | null;
  order_status: string;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  invoice_no: string | null;
  invoice_id: string | null;
};

const money = (value: number) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Shared list for ค้างชำระ / เกินกำหนด with the payment dialog and tax invoice print. */
export function OutstandingTable({ title, description, endpoint }: { title: string; description: string; endpoint: '/api/accounting/outstanding' | '/api/accounting/overdue' }) {
  const [rows, setRows] = useState<OutstandingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [paymentOrder, setPaymentOrder] = useState<PaymentDialogOrder | null>(null);
  const [pdfTarget, setPdfTarget] = useState<PdfPreviewTarget>(null);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: ActionSnackbarSeverity }>({ open: false, message: '', severity: 'info' });
  const showSnack = (message: string, severity: ActionSnackbarSeverity) => setSnack({ open: true, message, severity });

  const load = async () => {
    setLoading(true);
    setError('');
    const res = await fetch(endpoint, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    else setRows(data);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [endpoint]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.order_no, r.customer_name, r.invoice_no, r.sales_user_name].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [rows, search]);
  const totalOutstanding = useMemo(() => filtered.reduce((sum, r) => sum + Number(r.outstanding_amount || 0), 0), [filtered]);
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant='h4'>{title}</Typography>
        <Typography variant='body2' color='text.secondary'>{description}</Typography>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
        <TextField id='outstanding-search' size='small' label='ค้นหา เลขที่ / ลูกค้า / ใบกำกับ' value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 280 }} />
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
        <Box sx={{ ml: { sm: 'auto' } }}>
          <Typography variant='body2' color='text.secondary'>รวมค้างชำระ</Typography>
          <Typography sx={{ fontSize: 22, fontWeight: 900, color: 'error.main' }}>{money(totalOutstanding)} บาท</Typography>
        </Box>
      </Stack>
      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>เลขที่</TableCell>
              <TableCell>ลูกค้า</TableCell>
              <TableCell>พนักงานขาย</TableCell>
              <TableCell>ใบกำกับ</TableCell>
              <TableCell>กำหนดชำระ</TableCell>
              <TableCell align='right'>ยอดบิล</TableCell>
              <TableCell align='right'>รับแล้ว</TableCell>
              <TableCell align='right'>คงค้าง</TableCell>
              <TableCell>สถานะ</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((r) => {
              const overdue = r.due_date ? r.due_date < todayStr : false;
              const overdueDays = overdue && r.due_date ? Math.floor((new Date(todayStr).getTime() - new Date(r.due_date).getTime()) / 86400000) : 0;
              return (
                <TableRow key={r.sale_order_id} hover>
                  <TableCell sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}>{r.order_no || r.sale_order_id.slice(0, 8)}</TableCell>
                  <TableCell><Link href={`/dashboard/customers/${r.customer_id}`} style={{ color: 'inherit' }}>{r.customer_name}</Link></TableCell>
                  <TableCell>{r.sales_user_name || '-'}</TableCell>
                  <TableCell>{r.invoice_no || '-'}</TableCell>
                  <TableCell>{formatDate(r.due_date)}</TableCell>
                  <TableCell align='right'>{money(r.total_amount)}</TableCell>
                  <TableCell align='right'>{money(r.paid_amount)}</TableCell>
                  <TableCell align='right' sx={{ fontWeight: 900 }}>{money(r.outstanding_amount)}</TableCell>
                  <TableCell>
                    <Chip size='small' color={overdue ? 'error' : 'warning'} label={overdue ? `เกินกำหนด ${overdueDays} วัน` : r.paid_amount > 0 ? 'ชำระบางส่วน' : 'รอชำระ'} />
                  </TableCell>
                  <TableCell align='right' sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title='รับชำระ'>
                      <IconButton size='small' color='success' onClick={() => setPaymentOrder({ sale_order_id: r.sale_order_id, order_no: r.order_no, customer_name: r.customer_name, total_amount: r.total_amount })}>
                        <Payments fontSize='small' />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={r.invoice_no ? 'พิมพ์ใบกำกับภาษี' : 'ยังไม่ได้ออกใบกำกับ'}>
                      <span>
                        <IconButton size='small' color='primary' disabled={!r.invoice_no} onClick={() => setPdfTarget({ type: 'tax-invoice', id: r.sale_order_id, title: `ใบกำกับภาษี · ${r.invoice_no}` })}>
                          <PictureAsPdf fontSize='small' />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
            {!filtered.length && !loading ? <TableRow><TableCell colSpan={10} align='center'>ไม่พบรายการ</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Box>

      <PaymentDialog
        order={paymentOrder}
        onClose={() => setPaymentOrder(null)}
        onSaved={(result) => { showSnack(result.receipt_no ? `บันทึกรับชำระแล้ว ออกใบเสร็จ ${result.receipt_no}` : 'อัปเดตการรับชำระแล้ว', 'success'); void load(); }}
        onPrintReceipt={(receiptId, receiptNo) => setPdfTarget({ type: 'receipt', id: receiptId, title: `ใบเสร็จรับเงิน · ${receiptNo}` })}
      />
      <PdfPreviewDialog target={pdfTarget} onClose={() => setPdfTarget(null)} onNotify={showSnack} />
      <ActionSnackbar open={snack.open} message={snack.message} severity={snack.severity} onClose={() => setSnack((p) => ({ ...p, open: false }))} />
    </Stack>
  );
}
