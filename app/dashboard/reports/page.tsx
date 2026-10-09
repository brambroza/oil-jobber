'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download } from '@mui/icons-material';
import { Alert, Box, Button, Card, CardContent, Stack, Table, TableBody, TableCell, TableFooter, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { downloadCsv } from '@/lib/utils/csv';

type GroupBy = 'customer' | 'product' | 'sales';
type Row = { key: string; label: string; order_count: number; total_liters: number; goods_amount: number; delivery_fee_amount: number; discount_amount: number; total_amount: number; paid_amount: number; outstanding_amount: number };
type Summary = Omit<Row, 'key' | 'label'>;

const money = (value: number) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const liters = (value: number) => Number(value || 0).toLocaleString('th-TH');
const firstOfMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;
const today = () => new Date().toISOString().slice(0, 10);
const groupLabels: Record<GroupBy, string> = { customer: 'ลูกค้า', product: 'สินค้า', sales: 'พนักงานขาย' };

/** Sales report grouped by customer / product / salesperson with CSV export. */
export default function ReportsPage() {
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [groupBy, setGroupBy] = useState<GroupBy>('customer');
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async (nextGroupBy: GroupBy = groupBy) => {
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ from, to, group_by: nextGroupBy });
    const res = await fetch(`/api/reports/sales-summary?${qs.toString()}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดรายงานไม่สำเร็จ');
    else {
      setRows(data.rows || []);
      setSummary(data.summary || null);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const kpis = useMemo(() => [
    { label: 'ออเดอร์', value: String(summary?.order_count ?? 0) },
    { label: 'ลิตรรวม', value: liters(summary?.total_liters ?? 0) },
    { label: 'ยอดสุทธิ', value: money(summary?.total_amount ?? 0) },
    { label: 'ค้างชำระ', value: money(summary?.outstanding_amount ?? 0), color: 'error.main' },
  ], [summary]);

  const exportCsv = () => {
    downloadCsv(
      `sales-report-${groupBy}-${from}-${to}.csv`,
      [groupLabels[groupBy], 'ออเดอร์', 'ลิตร', 'ยอดน้ำมัน', 'ค่าขนส่ง', 'ส่วนลด', 'ยอดสุทธิ', 'ชำระแล้ว', 'ค้างชำระ'],
      rows.map((r) => [r.label, r.order_count, r.total_liters, r.goods_amount, r.delivery_fee_amount, r.discount_amount || 0, r.total_amount, r.paid_amount, r.outstanding_amount]),
    );
  };

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant='h4'>รายงานการขาย</Typography>
        <Typography variant='body2' color='text.secondary'>สรุปยอดขายน้ำมันตามช่วงวันที่ ไม่รวมบิลร่าง/ยกเลิก</Typography>
      </Box>
      <Card>
        <CardContent>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} alignItems={{ md: 'center' }}>
            <TextField id='report-from' size='small' label='ตั้งแต่' type='date' value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField id='report-to' size='small' label='ถึง' type='date' value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
            <ToggleButtonGroup
              size='small'
              exclusive
              value={groupBy}
              onChange={(_, value: GroupBy | null) => { if (value) { setGroupBy(value); void load(value); } }}
            >
              {(Object.keys(groupLabels) as GroupBy[]).map((key) => <ToggleButton key={key} value={key}>{groupLabels[key]}</ToggleButton>)}
            </ToggleButtonGroup>
            <Button variant='contained' onClick={() => void load()}>ดูรายงาน</Button>
            <Button variant='outlined' startIcon={<Download />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
          </Stack>
        </CardContent>
      </Card>
      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5}>
        {kpis.map((kpi) => (
          <Card key={kpi.label} sx={{ flex: 1 }}>
            <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
              <Typography variant='caption' color='text.secondary'>{kpi.label}</Typography>
              <Typography sx={{ fontSize: 22, fontWeight: 900, color: kpi.color ?? 'text.primary' }}>{kpi.value}</Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>{groupLabels[groupBy]}</TableCell>
              <TableCell align='right'>ออเดอร์</TableCell>
              <TableCell align='right'>ลิตร</TableCell>
              <TableCell align='right'>ยอดน้ำมัน</TableCell>
              <TableCell align='right'>ค่าขนส่ง</TableCell>
              <TableCell align='right'>ส่วนลด</TableCell>
              <TableCell align='right'>ยอดสุทธิ</TableCell>
              <TableCell align='right'>ชำระแล้ว</TableCell>
              <TableCell align='right'>ค้างชำระ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key} hover>
                <TableCell sx={{ fontWeight: 700 }}>{r.label}</TableCell>
                <TableCell align='right'>{r.order_count}</TableCell>
                <TableCell align='right'>{liters(r.total_liters)}</TableCell>
                <TableCell align='right'>{money(r.goods_amount)}</TableCell>
                <TableCell align='right'>{groupBy === 'product' ? '-' : money(r.delivery_fee_amount)}</TableCell>
                <TableCell align='right'>{groupBy === 'product' ? '-' : money(r.discount_amount || 0)}</TableCell>
                <TableCell align='right' sx={{ fontWeight: 800 }}>{money(r.total_amount)}</TableCell>
                <TableCell align='right'>{groupBy === 'product' ? '-' : money(r.paid_amount)}</TableCell>
                <TableCell align='right' sx={{ color: r.outstanding_amount > 0 ? 'error.main' : 'inherit' }}>{groupBy === 'product' ? '-' : money(r.outstanding_amount)}</TableCell>
              </TableRow>
            ))}
            {!rows.length && !loading ? <TableRow><TableCell colSpan={9} align='center'>ไม่มีข้อมูลในช่วงวันที่นี้</TableCell></TableRow> : null}
          </TableBody>
          {summary ? (
            <TableFooter>
              <TableRow sx={{ '& td': { fontWeight: 900, color: 'text.primary', fontSize: 13 } }}>
                <TableCell>รวม</TableCell>
                <TableCell align='right'>{summary.order_count}</TableCell>
                <TableCell align='right'>{liters(summary.total_liters)}</TableCell>
                <TableCell align='right'>{money(summary.goods_amount)}</TableCell>
                <TableCell align='right'>{money(summary.delivery_fee_amount)}</TableCell>
                <TableCell align='right'>{money(summary.discount_amount || 0)}</TableCell>
                <TableCell align='right'>{money(summary.total_amount)}</TableCell>
                <TableCell align='right'>{money(summary.paid_amount)}</TableCell>
                <TableCell align='right'>{money(summary.outstanding_amount)}</TableCell>
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </Box>
      {groupBy === 'product' ? <Typography variant='caption' color='text.secondary'>หมายเหตุ: ค่าขนส่งและส่วนลดคิดต่อบิล จึงแสดงเฉพาะแถวรวม</Typography> : null}
    </Stack>
  );
}
