'use client';

import { useEffect, useMemo, useState } from 'react';
import { PictureAsPdf } from '@mui/icons-material';
import { Alert, Box, Button, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Tooltip, Typography } from '@mui/material';
import { PdfPreviewDialog, type PdfPreviewTarget } from '@/components/documents/PdfPreviewDialog';
import { ActionSnackbar, type ActionSnackbarSeverity } from '@/components/common/ActionSnackbar';
import { PAYMENT_METHOD_LABELS } from '@/lib/documents/format';
import { formatDate } from '@/lib/utils/date-format';

type ReceiptRow = {
  id: string;
  receipt_no: string;
  order_no: string | null;
  sale_order_id: string;
  issued_at: string;
  amount: number;
  payment_method: string | null;
  reference_no: string | null;
  customer_name: string | null;
};

const money = (value: number) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Receipts issued by the payment flow; print or send via LINE. */
export default function ReceiptsPage() {
  const [rows, setRows] = useState<ReceiptRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [pdfTarget, setPdfTarget] = useState<PdfPreviewTarget>(null);
  const [snack, setSnack] = useState<{ open: boolean; message: string; severity: ActionSnackbarSeverity }>({ open: false, message: '', severity: 'info' });

  const load = async () => {
    setLoading(true);
    setError('');
    const res = await fetch('/api/accounting/receipt', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    else setRows(data);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.receipt_no, r.order_no, r.customer_name, r.reference_no].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [rows, search]);

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant='h4'>ใบเสร็จรับเงิน</Typography>
        <Typography variant='body2' color='text.secondary'>ออกอัตโนมัติทุกครั้งที่บันทึกรับชำระ เลขที่ RC-YYMMDD####</Typography>
      </Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField id='receipt-search' size='small' label='ค้นหา' value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 280 }} />
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
      </Stack>
      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}
      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>เลขที่ใบเสร็จ</TableCell>
              <TableCell>คำสั่งซื้อ</TableCell>
              <TableCell>ลูกค้า</TableCell>
              <TableCell>วันที่</TableCell>
              <TableCell>วิธีชำระ</TableCell>
              <TableCell>อ้างอิง</TableCell>
              <TableCell align='right'>จำนวนเงิน</TableCell>
              <TableCell align='right'></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filtered.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell sx={{ fontWeight: 800 }}>{r.receipt_no}</TableCell>
                <TableCell>{r.order_no || r.sale_order_id.slice(0, 8)}</TableCell>
                <TableCell>{r.customer_name || '-'}</TableCell>
                <TableCell>{formatDate(r.issued_at)}</TableCell>
                <TableCell>{PAYMENT_METHOD_LABELS[String(r.payment_method)] ?? r.payment_method ?? '-'}</TableCell>
                <TableCell>{r.reference_no || '-'}</TableCell>
                <TableCell align='right' sx={{ fontWeight: 900 }}>{money(r.amount)}</TableCell>
                <TableCell align='right'>
                  <Tooltip title='พิมพ์ / ส่ง LINE'>
                    <IconButton size='small' color='primary' onClick={() => setPdfTarget({ type: 'receipt', id: r.id, title: `ใบเสร็จรับเงิน · ${r.receipt_no}` })}>
                      <PictureAsPdf fontSize='small' />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            ))}
            {!filtered.length && !loading ? <TableRow><TableCell colSpan={8} align='center'>ยังไม่มีใบเสร็จ</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Box>
      <PdfPreviewDialog target={pdfTarget} onClose={() => setPdfTarget(null)} onNotify={(message, severity) => setSnack({ open: true, message, severity })} />
      <ActionSnackbar open={snack.open} message={snack.message} severity={snack.severity} onClose={() => setSnack((p) => ({ ...p, open: false }))} />
    </Stack>
  );
}
