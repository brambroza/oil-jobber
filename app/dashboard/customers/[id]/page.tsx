'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowBack, Download, PictureAsPdf } from '@mui/icons-material';
import {
  Alert, Box, Button, Card, CardContent, Chip, IconButton, Stack, Tab, Table, TableBody, TableCell, TableHead, TableRow, Tabs, TextField, Tooltip, Typography,
} from '@mui/material';
import { downloadCsv } from '@/lib/utils/csv';
import { statusColor, statusThai } from '@/lib/utils/order-status';
import { PdfPreviewDialog, type PdfPreviewTarget } from '@/components/documents/PdfPreviewDialog';
import { formatDate } from '@/lib/utils/date-format';

type CustomerDetail = {
  id: string;
  company_name: string;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  credit_limit: number;
  price_adjustment_per_liter: number;
  sales_fee_per_liter: number;
  status: string;
  sales_user_name: string | null;
  payment_conditions: { name: string; payment_type: string; credit_days: number } | null;
  credit: { credit_limit: number; used_credit: number; available_credit: number } | null;
};
type PurchaseRow = {
  order_id: string; order_no: string | null; order_date: string; order_status: string; product_summary: string;
  total_liters: number; goods_amount: number; delivery_fee_amount: number; discount_amount: number; total_amount: number; paid_amount: number; outstanding_amount: number;
};
type Summary = { order_count: number; total_liters: number; goods_amount: number; delivery_fee_amount: number; total_amount: number; paid_amount: number; outstanding_amount: number };

const money = (value: number) => Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const liters = (value: number) => Number(value || 0).toLocaleString('th-TH');
const firstOfMonth = () => `${new Date().toISOString().slice(0, 7)}-01`;
const today = () => new Date().toISOString().slice(0, 10);

/** Customer detail with purchase history and summary. */
export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = String(params?.id || '');
  const [tab, setTab] = useState<'info' | 'history'>('history');
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(today());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pdfTarget, setPdfTarget] = useState<PdfPreviewTarget>(null);

  useEffect(() => {
    if (!customerId) return;
    const run = async () => {
      const res = await fetch(`/api/customers/${customerId}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) setError(data.error || 'โหลดข้อมูลลูกค้าไม่สำเร็จ');
      else setCustomer(data);
    };
    void run();
  }, [customerId]);

  const loadHistory = async () => {
    if (!customerId) return;
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({ customer_id: customerId, from, to });
    const res = await fetch(`/api/reports/customer-purchases?${qs.toString()}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดประวัติไม่สำเร็จ');
    else {
      setRows(data.rows || []);
      setSummary(data.summary || null);
    }
    setLoading(false);
  };

  useEffect(() => { void loadHistory(); }, [customerId]);

  const kpis = useMemo(() => [
    { label: 'ออเดอร์', value: String(summary?.order_count ?? 0) },
    { label: 'ลิตรรวม', value: liters(summary?.total_liters ?? 0) },
    { label: 'ยอดซื้อรวม', value: money(summary?.total_amount ?? 0) },
    { label: 'ค้างชำระ', value: money(summary?.outstanding_amount ?? 0), color: 'error.main' },
  ], [summary]);

  const exportCsv = () => {
    downloadCsv(
      `purchase-history-${customer?.company_name || customerId}-${from}-${to}.csv`,
      ['เลขที่', 'วันที่', 'สินค้า', 'ลิตร', 'ค่าน้ำมัน', 'ค่าขนส่ง', 'ส่วนลด', 'ยอดสุทธิ', 'ชำระแล้ว', 'ค้างชำระ', 'สถานะ'],
      rows.map((r) => [r.order_no, formatDate(r.order_date), r.product_summary, r.total_liters, r.goods_amount, r.delivery_fee_amount, r.discount_amount, r.total_amount, r.paid_amount, r.outstanding_amount, statusThai(r.order_status)]),
    );
  };

  return (
    <Stack spacing={2}>
      <Stack direction='row' spacing={1} alignItems='center'>
        <IconButton component={Link} href='/dashboard/customers'><ArrowBack /></IconButton>
        <Box>
          <Typography variant='h4'>{customer?.company_name || 'ลูกค้า'}</Typography>
          <Stack direction='row' spacing={1} alignItems='center'>
            {customer ? <Chip size='small' label={customer.status} color={customer.status === 'ACTIVE' ? 'success' : 'default'} /> : null}
            {customer?.sales_user_name ? <Typography variant='body2' color='text.secondary'>พนักงานขายประจำ: {customer.sales_user_name}</Typography> : null}
          </Stack>
        </Box>
      </Stack>
      {error ? <Alert severity='error' onClose={() => setError('')}>{error}</Alert> : null}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ borderBottom: '1px solid #e2e8f0' }}>
        <Tab value='history' label='ประวัติการซื้อ' />
        <Tab value='info' label='ข้อมูลลูกค้า' />
      </Tabs>

      {tab === 'info' && customer ? (
        <Card>
          <CardContent>
            <Stack spacing={1}>
              {[
                ['เลขประจำตัวผู้เสียภาษี', customer.tax_id || '-'],
                ['ที่อยู่', customer.address || '-'],
                ['โทรศัพท์', customer.phone || '-'],
                ['วงเงินเครดิต', `${money(customer.credit_limit)} บาท`],
                ['ใช้ไป / คงเหลือ', customer.credit ? `${money(customer.credit.used_credit)} / ${money(customer.credit.available_credit)} บาท` : '-'],
                ['ค่ากลางปรับราคา (admin)', `${customer.price_adjustment_per_liter >= 0 ? '+' : ''}${money(customer.price_adjustment_per_liter)} บาท/ลิตร`],
                ['ค่าธรรมเนียมเซลบวกเพิ่ม', `+${money(customer.sales_fee_per_liter || 0)} บาท/ลิตร`],
                ['เงื่อนไขชำระเงิน', customer.payment_conditions ? `${customer.payment_conditions.name}${customer.payment_conditions.credit_days ? ` (${customer.payment_conditions.credit_days} วัน)` : ''}` : '-'],
              ].map(([label, value]) => (
                <Stack key={label} direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Typography sx={{ minWidth: 200 }} color='text.secondary'>{label}</Typography>
                  <Typography fontWeight={600}>{value}</Typography>
                </Stack>
              ))}
            </Stack>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'history' ? (
        <Stack spacing={2}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ sm: 'center' }}>
            <TextField id='history-from' size='small' label='ตั้งแต่' type='date' value={from} onChange={(e) => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
            <TextField id='history-to' size='small' label='ถึง' type='date' value={to} onChange={(e) => setTo(e.target.value)} InputLabelProps={{ shrink: true }} />
            <Button variant='contained' onClick={() => void loadHistory()}>ดูข้อมูล</Button>
            <Button variant='outlined' startIcon={<Download />} onClick={exportCsv} disabled={!rows.length}>Export CSV</Button>
          </Stack>
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
          {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}
          <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
            <Table size='small'>
              <TableHead>
                <TableRow>
                  <TableCell>วันที่</TableCell>
                  <TableCell>เลขที่</TableCell>
                  <TableCell>สินค้า</TableCell>
                  <TableCell align='right'>ลิตร</TableCell>
                  <TableCell align='right'>ค่าขนส่ง</TableCell>
                  <TableCell align='right'>ส่วนลด</TableCell>
                  <TableCell align='right'>ยอดสุทธิ</TableCell>
                  <TableCell align='right'>ชำระแล้ว</TableCell>
                  <TableCell align='right'>ค้าง</TableCell>
                  <TableCell>สถานะ</TableCell>
                  <TableCell align='right'></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.order_id} hover>
                    <TableCell>{formatDate(r.order_date)}</TableCell>
                    <TableCell sx={{ fontWeight: 800 }}>{r.order_no || r.order_id.slice(0, 8)}</TableCell>
                    <TableCell>{r.product_summary || '-'}</TableCell>
                    <TableCell align='right'>{liters(r.total_liters)}</TableCell>
                    <TableCell align='right'>{r.delivery_fee_amount > 0 ? money(r.delivery_fee_amount) : '0 (รับเอง)'}</TableCell>
                    <TableCell align='right'>{r.discount_amount > 0 ? `-${money(r.discount_amount)}` : '-'}</TableCell>
                    <TableCell align='right' sx={{ fontWeight: 800 }}>{money(r.total_amount)}</TableCell>
                    <TableCell align='right'>{money(r.paid_amount)}</TableCell>
                    <TableCell align='right' sx={{ color: r.outstanding_amount > 0 ? 'error.main' : 'inherit' }}>{money(r.outstanding_amount)}</TableCell>
                    <TableCell><Chip size='small' label={statusThai(r.order_status)} color={statusColor(r.order_status)} /></TableCell>
                    <TableCell align='right'>
                      <Tooltip title='ใบสั่งขาย (PDF)'>
                        <IconButton size='small' color='primary' onClick={() => setPdfTarget({ type: 'purchase-order', id: r.order_id, title: `ใบสั่งขาย · ${r.order_no || ''}` })}><PictureAsPdf fontSize='small' /></IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && !loading ? <TableRow><TableCell colSpan={11} align='center'>ไม่มีรายการในช่วงวันที่นี้</TableCell></TableRow> : null}
              </TableBody>
            </Table>
          </Box>
        </Stack>
      ) : null}

      <PdfPreviewDialog target={pdfTarget} onClose={() => setPdfTarget(null)} />
    </Stack>
  );
}
