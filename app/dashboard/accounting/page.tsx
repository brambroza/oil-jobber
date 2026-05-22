'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, Card, CardContent, Grid, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography, Button, Chip } from '@mui/material';

type OutstandingRow = { outstanding_amount: number };
type OverdueRow = { outstanding_amount: number };
type InvoiceRow = { id: string; invoice_no: string; issued_at: string; amount: number };

export default function AccountingSummaryPage() {
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [outstanding, setOutstanding] = useState<OutstandingRow[]>([]);
  const [overdue, setOverdue] = useState<OverdueRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const [o1, o2, o3] = await Promise.all([
        fetch(`/api/accounting/outstanding?company_id=${companyId}`),
        fetch(`/api/accounting/overdue?company_id=${companyId}`),
        fetch(`/api/accounting/invoice?company_id=${companyId}`),
      ]);
      const [d1, d2, d3] = await Promise.all([o1.json(), o2.json(), o3.json()]);
      if (!o1.ok) throw new Error(d1.error || 'โหลดยอดค้างไม่สำเร็จ');
      if (!o2.ok) throw new Error(d2.error || 'โหลดยอดเกินกำหนดไม่สำเร็จ');
      if (!o3.ok) throw new Error(d3.error || 'โหลดใบแจ้งหนี้ไม่สำเร็จ');
      setOutstanding(d1);
      setOverdue(d2);
      setInvoices(d3);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [companyId]);

  const outstandingTotal = useMemo(() => outstanding.reduce((sum, r) => sum + Number(r.outstanding_amount || 0), 0), [outstanding]);
  const overdueTotal = useMemo(() => overdue.reduce((sum, r) => sum + Number(r.outstanding_amount || 0), 0), [overdue]);
  const invoiceTotal = useMemo(() => invoices.reduce((sum, r) => sum + Number(r.amount || 0), 0), [invoices]);

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>ภาพรวมบัญชี</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField fullWidth label='Company ID' value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลดข้อมูล...</Alert> : null}

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Card><CardContent><Typography color='text.secondary'>ยอดค้างชำระรวม</Typography><Typography variant='h5'>{outstandingTotal.toFixed(2)} บาท</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card><CardContent><Typography color='text.secondary'>ยอดเกินกำหนดรวม</Typography><Typography variant='h5' color='error.main'>{overdueTotal.toFixed(2)} บาท</Typography></CardContent></Card>
        </Grid>
        <Grid item xs={12} md={4}>
          <Card><CardContent><Typography color='text.secondary'>มูลค่าใบแจ้งหนี้ทั้งหมด</Typography><Typography variant='h5'>{invoiceTotal.toFixed(2)} บาท</Typography></CardContent></Card>
        </Grid>
      </Grid>

      <Card>
        <CardContent>
          <Typography variant='h6' gutterBottom>ใบแจ้งหนี้ล่าสุด</Typography>
          <Table size='small'>
            <TableHead>
              <TableRow>
                <TableCell>เลขใบแจ้งหนี้</TableCell>
                <TableCell>วันที่ออก</TableCell>
                <TableCell align='right'>จำนวนเงิน</TableCell>
                <TableCell align='right'>สถานะ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {invoices.slice(0, 10).map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{r.invoice_no}</TableCell>
                  <TableCell>{r.issued_at}</TableCell>
                  <TableCell align='right'>{Number(r.amount).toFixed(2)}</TableCell>
                  <TableCell align='right'><Chip size='small' label='ออกแล้ว' color='success' /></TableCell>
                </TableRow>
              ))}
              {!invoices.length && !loading ? <TableRow><TableCell colSpan={4} align='center'>ยังไม่มีใบแจ้งหนี้</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </Stack>
  );
}
