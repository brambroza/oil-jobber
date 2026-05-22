'use client';

import { useEffect, useMemo, useState } from 'react';
import { WarningAmber } from '@mui/icons-material';
import { Alert, Box, Button, Chip, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from '@mui/material';

type OverdueRow = {
  sale_order_id: string;
  customer_id: string;
  customer_name: string;
  due_date: string | null;
  outstanding_amount: number;
};

export default function OverduePage() {
  const [companyId, setCompanyId] = useState('');
  const [rows, setRows] = useState<OverdueRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    const res = await fetch(`/api/accounting/overdue?company_id=${companyId}`);
    const data = await res.json();
    if (!res.ok) setError(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    else setRows(data);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [companyId]);

  const totalOverdue = useMemo(() => rows.reduce((sum, r) => sum + Number(r.outstanding_amount || 0), 0), [rows]);

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>ยอดเกินกำหนด</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField fullWidth label='Company ID' value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
      </Stack>
      <Alert severity='warning' icon={<WarningAmber />}>ยอดรวมเกินกำหนด: {totalOverdue.toFixed(2)} บาท</Alert>
      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>Sale Order ID</TableCell>
              <TableCell>ลูกค้า</TableCell>
              <TableCell>กำหนดชำระ</TableCell>
              <TableCell align='right'>ยอดเกินกำหนด</TableCell>
              <TableCell align='right'>สถานะ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.sale_order_id} hover>
                <TableCell>{r.sale_order_id}</TableCell>
                <TableCell>{r.customer_name}</TableCell>
                <TableCell>{r.due_date ?? '-'}</TableCell>
                <TableCell align='right'>{Number(r.outstanding_amount).toFixed(2)}</TableCell>
                <TableCell align='right'><Chip size='small' color='error' label='เกินกำหนด' /></TableCell>
              </TableRow>
            ))}
            {!rows.length && !loading ? <TableRow><TableCell colSpan={5} align='center'>ไม่พบยอดเกินกำหนด</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Box>
    </Stack>
  );
}
