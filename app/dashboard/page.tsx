'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';

type OrderRow = {
  id: string;
  order_status: string;
  created_at: string;
  customers?: { company_name?: string } | null;
};

type InvoiceRow = {
  id: string;
  invoice_no: string;
  issued_at: string;
  amount: number;
  sale_order_id: string;
};

type OutstandingRow = { outstanding_amount: number };
type OverdueRow = { outstanding_amount: number };

function formatMoney(value: number): string {
  return new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
}

function monthKey(dateIso: string): string {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return '-';
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}`;
}

function labelMonth(key: string): string {
  const [y, m] = key.split('-');
  if (!y || !m) return key;
  return `${m}/${String(y).slice(2)}`;
}

function statusThai(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'ร่าง',
    SUBMITTED: 'ส่งคำสั่งซื้อ',
    ADMIN_REVIEW: 'รอแอดมินตรวจ',
    CONFIRMED: 'ยืนยันแล้ว',
    REFINERY_BOOKED: 'จองโรงกลั่นแล้ว',
    WAITING_PAYMENT: 'รอชำระเงิน',
    PAID: 'ชำระแล้ว',
    PICKUP_READY: 'พร้อมรับสินค้า',
    DELIVERING: 'กำลังจัดส่ง',
    COMPLETED: 'เสร็จสิ้น',
    CANCELLED: 'ยกเลิก',
  };
  return map[status] || status;
}

export default function DashboardPage() {
  const companyId = process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '';

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [outstanding, setOutstanding] = useState<OutstandingRow[]>([]);
  const [overdue, setOverdue] = useState<OverdueRow[]>([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      if (!companyId) {
        setError('ไม่พบ DEFAULT_COMPANY_ID กรุณาตั้งค่าใน .env');
        return;
      }

      setLoading(true);
      setError('');

      const [rOrders, rInvoices, rOutstanding, rOverdue] = await Promise.all([
        fetch(`/api/orders?company_id=${companyId}`),
        fetch(`/api/accounting/invoice?company_id=${companyId}`),
        fetch(`/api/accounting/outstanding?company_id=${companyId}`),
        fetch(`/api/accounting/overdue?company_id=${companyId}`),
      ]);

      const [dOrders, dInvoices, dOutstanding, dOverdue] = await Promise.all([
        rOrders.json(),
        rInvoices.json(),
        rOutstanding.json(),
        rOverdue.json(),
      ]);

      if (!rOrders.ok) setError(dOrders.error || 'โหลดคำสั่งซื้อไม่สำเร็จ');
      else setOrders(dOrders || []);

      if (!rInvoices.ok) setError((prev) => prev || dInvoices.error || 'โหลดใบแจ้งหนี้ไม่สำเร็จ');
      else setInvoices((dInvoices || []).map((x: any) => ({ ...x, amount: Number(x.amount || 0) })));

      if (!rOutstanding.ok) setError((prev) => prev || dOutstanding.error || 'โหลดค้างชำระไม่สำเร็จ');
      else setOutstanding(dOutstanding || []);

      if (!rOverdue.ok) setError((prev) => prev || dOverdue.error || 'โหลดยอดเกินกำหนดไม่สำเร็จ');
      else setOverdue(dOverdue || []);

      setLoading(false);
    };

    void load();
  }, [companyId]);

  const summary = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const month = now.getMonth();
    const year = now.getFullYear();

    const dailySales = invoices
      .filter((i) => i.issued_at === todayKey)
      .reduce((sum, i) => sum + Number(i.amount || 0), 0);

    const monthlySales = invoices
      .filter((i) => {
        const d = new Date(i.issued_at);
        return !Number.isNaN(d.getTime()) && d.getMonth() === month && d.getFullYear() === year;
      })
      .reduce((sum, i) => sum + Number(i.amount || 0), 0);

    const outstandingAmount = outstanding.reduce((sum, x) => sum + Number(x.outstanding_amount || 0), 0);
    const overdueAmount = overdue.reduce((sum, x) => sum + Number(x.outstanding_amount || 0), 0);

    const grossProfitEstimate = monthlySales * 0.015;

    return {
      dailySales,
      monthlySales,
      totalOrders: orders.length,
      outstandingAmount,
      overdueAmount,
      grossProfitEstimate,
    };
  }, [invoices, orders.length, outstanding, overdue]);

  const barSeries = useMemo(() => {
    const now = new Date();
    const months: string[] = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const m = String(d.getMonth() + 1).padStart(2, '0');
      months.push(`${d.getFullYear()}-${m}`);
    }

    const map = new Map<string, number>();
    for (const key of months) map.set(key, 0);

    for (const inv of invoices) {
      const k = monthKey(inv.issued_at);
      if (map.has(k)) map.set(k, (map.get(k) || 0) + Number(inv.amount || 0));
    }

    const list = months.map((k) => ({ key: k, label: labelMonth(k), value: map.get(k) || 0 }));
    const max = Math.max(...list.map((x) => x.value), 1);
    return list.map((x) => ({ ...x, percent: (x.value / max) * 100 }));
  }, [invoices]);

  const pieSeries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) counts.set(o.order_status, (counts.get(o.order_status) || 0) + 1);
    const total = orders.length || 1;

    const palette = ['#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b', '#22c55e'];
    let start = 0;

    return [...counts.entries()].map(([status, count], idx) => {
      const percent = (count / total) * 100;
      const end = start + percent;
      const segment = {
        status,
        label: statusThai(status),
        count,
        percent,
        color: palette[idx % palette.length],
        start,
        end,
      };
      start = end;
      return segment;
    });
  }, [orders]);

  const pieBackground = useMemo(() => {
    if (!pieSeries.length) return '#e5e7eb';
    return `conic-gradient(${pieSeries
      .map((p) => `${p.color} ${p.start.toFixed(2)}% ${p.end.toFixed(2)}%`)
      .join(', ')})`;
  }, [pieSeries]);

  const latestSales = useMemo(() => [...invoices].sort((a, b) => b.issued_at.localeCompare(a.issued_at)).slice(0, 8), [invoices]);
  const latestOrders = useMemo(() => [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10), [orders]);

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>แดชบอร์ดภาพรวมการขาย</Typography>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลดข้อมูล...</Alert> : null}

      <Grid container spacing={2}>
        {[
          ['ยอดขายรายวัน', formatMoney(summary.dailySales)],
          ['ยอดขายรายเดือน', formatMoney(summary.monthlySales)],
          ['ออเดอร์ทั้งหมด', summary.totalOrders.toLocaleString('th-TH')],
          ['ค้างชำระ', formatMoney(summary.outstandingAmount)],
          ['เกินกำหนด', formatMoney(summary.overdueAmount)],
          ['กำไรขั้นต้น (ประมาณ)', formatMoney(summary.grossProfitEstimate)],
        ].map(([title, value]) => (
          <Grid item xs={12} sm={6} md={4} key={title}>
            <Card variant='outlined' sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant='body2' color='text.secondary'>{title}</Typography>
                <Typography variant='h5' sx={{ fontWeight: 700, mt: 0.5 }}>{value}</Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={7}>
          <Card variant='outlined' sx={{ borderRadius: 2, height: '100%' }}>
            <CardContent>
              <Typography variant='h6' sx={{ mb: 1.5 }}>ยอดขายรายเดือน (Bar Chart)</Typography>
              <Stack spacing={1.1}>
                {barSeries.map((b) => (
                  <Box key={b.key}>
                    <Stack direction='row' justifyContent='space-between' alignItems='center' sx={{ mb: 0.35 }}>
                      <Typography variant='caption' color='text.secondary'>{b.label}</Typography>
                      <Typography variant='caption' sx={{ fontWeight: 600 }}>{formatMoney(b.value)}</Typography>
                    </Stack>
                    <Box sx={{ height: 10, borderRadius: 10, bgcolor: '#e5e7eb', overflow: 'hidden' }}>
                      <Box sx={{ width: `${b.percent}%`, height: '100%', bgcolor: '#0f172a' }} />
                    </Box>
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card variant='outlined' sx={{ borderRadius: 2, height: '100%' }}>
            <CardContent>
              <Typography variant='h6' sx={{ mb: 1.5 }}>สัดส่วนสถานะออเดอร์ (Pie Chart)</Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems='center'>
                <Box sx={{ width: 170, height: 170, borderRadius: '50%', background: pieBackground, border: '10px solid #fff', boxShadow: 'inset 0 0 0 1px #e5e7eb' }} />
                <Stack spacing={0.8} sx={{ flex: 1, width: '100%' }}>
                  {pieSeries.map((p) => (
                    <Stack key={p.status} direction='row' justifyContent='space-between' alignItems='center'>
                      <Stack direction='row' spacing={1} alignItems='center'>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: p.color }} />
                        <Typography variant='body2'>{p.label}</Typography>
                      </Stack>
                      <Chip size='small' label={`${p.count} (${p.percent.toFixed(1)}%)`} />
                    </Stack>
                  ))}
                  {!pieSeries.length ? <Typography variant='body2' color='text.secondary'>ยังไม่มีข้อมูลออเดอร์</Typography> : null}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <Card variant='outlined' sx={{ borderRadius: 2, height: '100%' }}>
            <CardContent>
              <Typography variant='h6' sx={{ mb: 1.5 }}>รายการขายล่าสุด</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size='small'>
                  <TableHead>
                    <TableRow>
                      <TableCell>เลขที่ใบแจ้งหนี้</TableCell>
                      <TableCell>วันที่</TableCell>
                      <TableCell align='right'>ยอดขาย</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {latestSales.map((inv) => (
                      <TableRow key={inv.id} hover>
                        <TableCell>{inv.invoice_no || '-'}</TableCell>
                        <TableCell>{inv.issued_at || '-'}</TableCell>
                        <TableCell align='right'>{formatMoney(inv.amount)}</TableCell>
                      </TableRow>
                    ))}
                    {!latestSales.length ? (
                      <TableRow><TableCell colSpan={3} align='center'>ไม่มีข้อมูลการขาย</TableCell></TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card variant='outlined' sx={{ borderRadius: 2, height: '100%' }}>
            <CardContent>
              <Typography variant='h6' sx={{ mb: 1.5 }}>สถานะใบสั่งซื้อของลูกค้า</Typography>
              <Box sx={{ overflowX: 'auto' }}>
                <Table size='small'>
                  <TableHead>
                    <TableRow>
                      <TableCell>ลูกค้า</TableCell>
                      <TableCell>สถานะ</TableCell>
                      <TableCell>วันที่สร้าง</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {latestOrders.map((o) => (
                      <TableRow key={o.id} hover>
                        <TableCell>{o.customers?.company_name || '-'}</TableCell>
                        <TableCell>{statusThai(o.order_status)}</TableCell>
                        <TableCell>{new Date(o.created_at).toLocaleDateString('th-TH')}</TableCell>
                      </TableRow>
                    ))}
                    {!latestOrders.length ? (
                      <TableRow><TableCell colSpan={3} align='center'>ไม่มีข้อมูลใบสั่งซื้อ</TableCell></TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {loading ? (
        <Stack direction='row' spacing={1} alignItems='center'>
          <CircularProgress size={16} />
          <Typography variant='caption' color='text.secondary'>กำลังอัปเดตแดชบอร์ด...</Typography>
        </Stack>
      ) : null}
    </Stack>
  );
}
