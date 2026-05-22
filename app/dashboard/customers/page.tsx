'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, Delete, Edit } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  MenuItem,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { Customer, PaymentCondition } from '@/types/database';

type CustomerWithPayment = Customer & {
  payment_conditions?: { name?: string; code?: string } | null;
};

type CustomerForm = {
  id?: string;
  company_name: string;
  tax_id: string;
  address: string;
  phone: string;
  credit_limit: number;
  payment_condition_id: string;
  status: string;
};

const emptyForm: CustomerForm = {
  company_name: '',
  tax_id: '',
  address: '',
  phone: '',
  credit_limit: 0,
  payment_condition_id: '',
  status: 'ACTIVE',
};

export default function CustomersPage() {
  const [companyId, setCompanyId] = useState('');
  const [rows, setRows] = useState<CustomerWithPayment[]>([]);
  const [paymentConditions, setPaymentConditions] = useState<PaymentCondition[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [searchDate, setSearchDate] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const isEdit = useMemo(() => Boolean(form.id), [form.id]);
  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const d = searchDate.trim();
    return rows.filter((r) => {
      const okText =
        !q ||
        (r.company_name || '').toLowerCase().includes(q) ||
        (r.tax_id || '').toLowerCase().includes(q) ||
        (r.phone || '').toLowerCase().includes(q) ||
        (r.address || '').toLowerCase().includes(q) ||
        (r.payment_conditions?.name || '').toLowerCase().includes(q) ||
        (r.payment_conditions?.code || '').toLowerCase().includes(q);
      const okDate = !d || String(r.created_at || '').includes(d) || String(r.updated_at || '').includes(d);
      return okText && okDate;
    });
  }, [rows, searchText, searchDate]);
  const pagedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    try {
      const [customerRes, paymentRes] = await Promise.all([
        fetch(`/api/customers?company_id=${companyId}`),
        fetch(`/api/payment-conditions?company_id=${companyId}`),
      ]);
      const [customerData, paymentData] = await Promise.all([customerRes.json(), paymentRes.json()]);

      if (!customerRes.ok) throw new Error(customerData.error || 'โหลดข้อมูลลูกค้าไม่สำเร็จ');
      if (!paymentRes.ok) throw new Error(paymentData.error || 'โหลดเงื่อนไขชำระเงินไม่สำเร็จ');

      setRows(customerData);
      setPaymentConditions(paymentData);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [companyId]);

  const onSave = async () => {
    try {
      const payload = {
        company_id: companyId,
        company_name: form.company_name,
        tax_id: form.tax_id || null,
        address: form.address || null,
        phone: form.phone || null,
        credit_limit: form.credit_limit,
        payment_condition_id: form.payment_condition_id || null,
        status: form.status,
      };
      const res = await fetch(form.id ? `/api/customers/${form.id}` : '/api/customers', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      setDrawerOpen(false);
      setForm(emptyForm);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onDelete = async () => {
    if (!deleteId) return;
    try {
      const res = await fetch(`/api/customers/${deleteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');
      setDeleteId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Stack spacing={2}>
      <Typography variant='h4'>จัดการลูกค้า</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} spacing={1}>
        <TextField
          size='small'
          label='ค้นหา'
          placeholder='บริษัท, เลขภาษี, เบอร์โทร, เงื่อนไขชำระเงิน'
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: { xs: '100%', md: 320 } }}
        />
        <TextField
          size='small'
          label='ค้นหาตามวันที่'
          placeholder='YYYY-MM-DD'
          value={searchDate}
          onChange={(e) => {
            setSearchDate(e.target.value);
            setPage(0);
          }}
          sx={{ minWidth: { xs: '100%', md: 220 } }}
        />
    {/*     <TextField label='Company ID' value={companyId} onChange={(e) => setCompanyId(e.target.value)} fullWidth /> */}
        <Button variant='outlined' onClick={() => void load()}>รีเฟรช</Button>
        <Button variant='contained' startIcon={<Add />} onClick={() => { setForm(emptyForm); setDrawerOpen(true); }}>เพิ่มลูกค้า</Button>
      </Stack>
      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}
      <Box sx={{ overflowX: 'auto', bgcolor: 'background.paper', borderRadius: 1 }}>
        <Table size='small'>
          <TableHead>
            <TableRow>
              <TableCell>บริษัท</TableCell>
              <TableCell>เลขภาษี</TableCell>
              <TableCell>ที่อยู่</TableCell>
              <TableCell>เบอร์โทร</TableCell>
              <TableCell align='right'>วงเงินเครดิต</TableCell>
              <TableCell>เงื่อนไขชำระเงิน</TableCell>
              <TableCell>สถานะ</TableCell>
              <TableCell align='right'>จัดการ</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pagedRows.map((r) => (
              <TableRow key={r.id} hover>
                <TableCell>{r.company_name}</TableCell>
                <TableCell>{r.tax_id ?? '-'}</TableCell>
                <TableCell sx={{ minWidth: 180 }}>{r.address ?? '-'}</TableCell>
                <TableCell>{r.phone ?? '-'}</TableCell>
                <TableCell align='right'>{Number(r.credit_limit).toFixed(2)}</TableCell>
                <TableCell>{r.payment_conditions?.name ?? '-'}</TableCell>
                <TableCell><Chip size='small' label={r.status} color={r.status === 'ACTIVE' ? 'success' : 'default'} /></TableCell>
                <TableCell align='right'>
                  <IconButton onClick={() => {
                    setForm({
                      id: r.id,
                      company_name: r.company_name,
                      tax_id: r.tax_id ?? '',
                      address: r.address ?? '',
                      phone: r.phone ?? '',
                      credit_limit: Number(r.credit_limit),
                      payment_condition_id: r.payment_condition_id ?? '',
                      status: r.status,
                    });
                    setDrawerOpen(true);
                  }}><Edit fontSize='small' /></IconButton>
                  <IconButton color='error' onClick={() => setDeleteId(r.id)}><Delete fontSize='small' /></IconButton>
                </TableCell>
              </TableRow>
            ))}
            {!filteredRows.length && !loading ? <TableRow><TableCell colSpan={8} align='center'>ไม่มีข้อมูล</TableCell></TableRow> : null}
          </TableBody>
        </Table>
        <TablePagination
          component='div'
          count={filteredRows.length}
          page={page}
          onPageChange={(_, nextPage) => setPage(nextPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(Number(e.target.value));
            setPage(0);
          }}
          rowsPerPageOptions={[10, 15, 20, 25]}
          labelRowsPerPage='แถวต่อหน้า'
        />
      </Box>

      <Drawer anchor='right' open={drawerOpen} onClose={() => setDrawerOpen(false)}>
        <Stack sx={{ width: { xs: 340, sm: 460 }, p: 2 }} spacing={2}>
          <Typography variant='h6'>{isEdit ? 'แก้ไขลูกค้า' : 'เพิ่มลูกค้า'}</Typography>
          <TextField label='บริษัท' value={form.company_name} onChange={(e) => setForm((p) => ({ ...p, company_name: e.target.value }))} required />
          <TextField label='เลขภาษี' value={form.tax_id} onChange={(e) => setForm((p) => ({ ...p, tax_id: e.target.value }))} />
          <TextField label='ที่อยู่' multiline minRows={3} value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
          <TextField label='เบอร์โทร' value={form.phone} onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))} />
          <TextField label='วงเงินเครดิต' type='number' value={form.credit_limit} onChange={(e) => setForm((p) => ({ ...p, credit_limit: Number(e.target.value) }))} />
          <TextField
            select
            label='เงื่อนไขชำระเงิน'
            value={form.payment_condition_id}
            onChange={(e) => setForm((p) => ({ ...p, payment_condition_id: e.target.value }))}
          >
            <MenuItem value=''>ไม่ระบุ</MenuItem>
            {paymentConditions.map((pc) => (
              <MenuItem key={pc.id} value={pc.id}>{pc.name} ({pc.code})</MenuItem>
            ))}
          </TextField>
          <TextField label='สถานะ' value={form.status} onChange={(e) => setForm((p) => ({ ...p, status: e.target.value }))} />
          <Button variant='contained' onClick={() => void onSave()} disabled={!companyId || !form.company_name}>บันทึก</Button>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>ต้องการลบข้อมูลลูกค้านี้ใช่หรือไม่</DialogContent>
        <DialogActions><Button onClick={() => setDeleteId(null)}>ยกเลิก</Button><Button color='error' onClick={() => void onDelete()}>ลบ</Button></DialogActions>
      </Dialog>
    </Stack>
  );
}
