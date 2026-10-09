'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Alert, Box, Button, Card, CardActionArea, CardContent, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from '@mui/material';

type OutstandingRow = { outstanding_amount: number; due_date: string | null };
type InvoiceRow = { id: string; invoice_no: string; issued_at: string; total_amount: number; status: string; customer_name: string | null; order_no: string | null };

const money = (value: number) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusLabel: Record<string, { label: string; color: 'success' | 'warning' | 'default' }> = {
  ISSUED: { label: 'รอชำระ', color: 'warning' },
  PAID: { label: 'ชำระแล้ว', color: 'success' },
  CANCELLED: { label: 'ยกเลิก', color: 'default' },
};

/** Accounting overview with links to the working pages. */
export default function AccountingSummaryPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [outstanding, setOutstanding] = useState<OutstandingRow[]>([]);
  const [overdue, setOverdue] = useState<OutstandingRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [o1, o2, o3] = await Promise.all([
        fetch('/api/accounting/outstanding', { cache: 'no-store' }),
        fetch('/api/accounting/overdue', { cache: 'no-store' }),
        fetch('/api/accounting/invoice', { cache: 'no-store' }),
      ]);
      const [d1, d2, d3] = await Promise.all([o1.json(), o2.json(), o3.json()]);
      if (!o1.ok) throw new Error(d1.error || 'โหลดยอดค้างไม่สำเร็จ');
      if (!o2.ok) throw new Error(d2.error || 'โหลดยอดเกินกำหนดไม่สำเร็จ');
      if (!o3.ok) throw new Error(d3.error || 'โหลดใบกำกับไม่สำเร็จ');
      setOutstanding(d1);
      setOverdue(d2);
      setInvoices(d3);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const outstandingTotal = useMemo(() => outstanding.reduce((sum, r) => sum + Number(r.outstanding_amount || 0), 0), [outstanding]);
  const overdueTotal = useMemo(() => overdue.reduce((sum, r) => sum + Number(r.outstanding_amount || 0), 0), [overdue]);
  const invoiceTotal = useMemo(() => invoices.filter((r) => r.status !== 'CANCELLED').reduce((sum, r) => sum + Number(r.total_amount || 0), 0), [invoices]);

  const cards = [
    { title: 'ยอดค้างชำระรวม', value: outstandingTotal, count: `${outstanding.length} บิล`, href: '/dashboard/accounting/outstanding', color: 'warning.main' },
    { title: 'เกินกำหนดชำระ', value: overdueTotal, count: `${overdue.length} บิล`, href: '/dashboard/accounting/overdue', color: 'error.main' },
    { title: 'มูลค่าใบกำกับภาษี', value: invoiceTotal, count: `${invoices.length} ใบ`, href: '/dashboard/accounting/invoices', color: 'text.primary' },
  ];

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant='h4'>ภาพรวมบัญชี</Typography>
        <Typography variant='body2' color='text.secondary'>รับชำระ ออกใบกำกับภาษี และติดตามยอดค้าง</Typography>
      </Box>
      <Stack direction='row' spacing={1} flexWrap='wrap' useFlexGap>
        <Button component={Link} href='/dashboard/accounting/outstanding' variant='contained'>ค้างชำระ / รับชำระ</Button>
        <Button component={Link} href='/dashboard/accounting/overdue' variant='outlined' color='error'>เกินกำหนด</Button>
        <Button component={Link} href='/dashboard/accounting/invoices' variant='outlined'>ใบกำกับภาษี</Button>
        <Button component={Link} href='/dashboard/accounting/receipts' variant='outlined'>ใบเสร็จรับเงิน</Button>
        <Button variant='text' onClick={() => void load()}>รีเฟรช</Button>
      </Stack>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลดข้อมูล...</Alert> : null}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        {cards.map((card) => (
          <Card key={card.title} sx={{ flex: 1 }}>
            <CardActionArea component={Link} href={card.href}>
              <CardContent>
                <Typography color='text.secondary'>{card.title}</Typography>
                <Typography variant='h5' sx={{ color: card.color, fontWeight: 900 }}>{money(card.value)} บาท</Typography>
                <Typography variant='caption' color='text.secondary'>{card.count}</Typography>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Stack>

      <Card>
        <CardContent>
          <Typography variant='h6' gutterBottom>ใบกำกับภาษีล่าสุด</Typography>
          <Box sx={{ overflowX: 'auto' }}>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>เลขที่</TableCell>
                  <TableCell>คำสั่งซื้อ</TableCell>
                  <TableCell>ลูกค้า</TableCell>
                  <TableCell>วันที่ออก</TableCell>
                  <TableCell align='right'>จำนวนเงิน</TableCell>
                  <TableCell align='right'>สถานะ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoices.slice(0, 10).map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell>{r.invoice_no}</TableCell>
                    <TableCell>{r.order_no || '-'}</TableCell>
                    <TableCell>{r.customer_name || '-'}</TableCell>
                    <TableCell>{r.issued_at}</TableCell>
                    <TableCell align='right'>{money(r.total_amount)}</TableCell>
                    <TableCell align='right'><Chip size='small' label={statusLabel[r.status]?.label ?? r.status} color={statusLabel[r.status]?.color ?? 'default'} /></TableCell>
                  </TableRow>
                ))}
                {!invoices.length && !loading ? <TableRow><TableCell colSpan={6} align='center'>ยังไม่มีใบกำกับภาษี</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </Box>
        </CardContent>
      </Card>
    </Stack>
  );
}
