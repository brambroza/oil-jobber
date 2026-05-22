'use client';

import { useEffect, useState } from 'react';
import { AddCard } from '@mui/icons-material';
import { Alert, Box, Button, Chip, Drawer, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';

type OutstandingRow = {
  sale_order_id: string;
  customer_id: string;
  customer_name: string;
  due_date: string | null;
  outstanding_amount: number;
};

export default function OutstandingPage() {
  const [companyId, setCompanyId] = useState('');
  const [rows, setRows] = useState<OutstandingRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [payment, setPayment] = useState({ sale_order_id: '', paid_at: new Date().toISOString().slice(0, 10), amount: 0 });

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    const res = await fetch(`/api/accounting/outstanding?company_id=${companyId}`);
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    else setRows(data);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [companyId]);

  const savePayment = async () => {
    const res = await fetch('/api/accounting/payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payment, company_id: companyId }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.error || 'บันทึกการชำระไม่สำเร็จ');
    else { setDrawerOpen(false); await load(); }
  };

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>ยอดค้างชำระ</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField fullWidth label='Company ID' value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
      </Stack>
      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>Sale Order ID</TableCell>
              <TableCell>ลูกค้า</TableCell>
              <TableCell>กำหนดชำระ</TableCell>
              <TableCell align='right'>ยอดค้าง</TableCell>
              <TableCell align='right'>สถานะ</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => {
              const overdue = r.due_date ? new Date(r.due_date) < new Date(new Date().toISOString().slice(0, 10)) : false;
              return (
                <TableRow key={r.sale_order_id} hover>
                  <TableCell>{r.sale_order_id}</TableCell>
                  <TableCell>{r.customer_name}</TableCell>
                  <TableCell>{r.due_date ?? '-'}</TableCell>
                  <TableCell align='right'>{Number(r.outstanding_amount).toFixed(2)}</TableCell>
                  <TableCell align='right'><Chip size='small' color={overdue ? 'error' : 'warning'} label={overdue ? 'เกินกำหนด' : 'ค้างชำระ'} /></TableCell>
                  <TableCell align='right'>
                    <IconButton onClick={() => { setPayment({ sale_order_id: r.sale_order_id, paid_at: new Date().toISOString().slice(0, 10), amount: Number(r.outstanding_amount) }); setDrawerOpen(true); }}>
                      <AddCard fontSize='small' />
                    </IconButton>
                  </TableCell>
                </TableRow>
              );
            })}
            {!rows.length && !loading ? <TableRow><TableCell colSpan={6} align='center'>ไม่พบยอดค้างชำระ</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Box>

      <Drawer anchor='right' open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Stack sx={{ width: { xs: 320, sm: 420 }, p: 2 }} spacing={2}>
          <Typography variant='h6'>บันทึกรับชำระ</Typography>
          <TextField label='Sale Order ID' value={payment.sale_order_id} onChange={(e) => setPayment((p) => ({ ...p, sale_order_id: e.target.value }))} />
          <TextField label='วันที่รับชำระ' type='date' value={payment.paid_at} onChange={(e) => setPayment((p) => ({ ...p, paid_at: e.target.value }))} InputLabelProps={{ shrink: true }} />
          <TextField label='จำนวนเงิน' type='number' value={payment.amount} onChange={(e) => setPayment((p) => ({ ...p, amount: Number(e.target.value) }))} />
          <Button variant='contained' onClick={() => void savePayment()} disabled={!companyId || !payment.sale_order_id || payment.amount <= 0}>บันทึก</Button>
        </Stack>
      </Drawer>
    </Stack>
  );
}
