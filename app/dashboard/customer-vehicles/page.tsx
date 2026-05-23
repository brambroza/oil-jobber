'use client';

import { useEffect, useMemo, useState } from 'react';
import { Add, Delete, Edit } from '@mui/icons-material';
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';

type Row = {
  id: string;
  customer_id: string;
  license_plate: string;
  driver_name: string | null;
  driver_phone: string | null;
  pickup_license_number: string | null;
  created_at: string;
  updated_at: string;
  customers?: { company_name?: string } | null;
};

type Customer = { id: string; company_name: string };

type VehicleForm = {
  id?: string;
  customer_id: string;
  license_plate: string;
  driver_name: string;
  driver_phone: string;
  pickup_license_number: string;
};

const emptyForm: VehicleForm = {
  customer_id: '',
  license_plate: '',
  driver_name: '',
  driver_phone: '',
  pickup_license_number: '',
};

export default function CustomerVehiclesPage() {
  const [companyId] = useState(process.env.NEXT_PUBLIC_DEFAULT_COMPANY_ID ?? '');
  const [rows, setRows] = useState<Row[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<VehicleForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return rows.filter((r) => {
      if (!q) return true;
      return (
        String(r.customers?.company_name || '').toLowerCase().includes(q) ||
        String(r.license_plate || '').toLowerCase().includes(q) ||
        String(r.driver_name || '').toLowerCase().includes(q) ||
        String(r.driver_phone || '').toLowerCase().includes(q) ||
        String(r.pickup_license_number || '').toLowerCase().includes(q)
      );
    });
  }, [rows, searchText]);

  const pagedRows = useMemo(() => {
    const start = page * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, page, rowsPerPage]);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    setError('');
    const [vehicleRes, customerRes] = await Promise.all([
      fetch(`/api/customer-vehicles?company_id=${companyId}`),
      fetch(`/api/customers?company_id=${companyId}`),
    ]);
    const [vehicleData, customerData] = await Promise.all([vehicleRes.json(), customerRes.json()]);
    if (!vehicleRes.ok) setError(vehicleData.error || 'โหลดข้อมูลรถไม่สำเร็จ');
    else setRows(vehicleData || []);
    if (customerRes.ok) {
      setCustomers((customerData || []).map((x: any) => ({ id: x.id, company_name: x.company_name })));
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [companyId]);

  const save = async () => {
    setError('');
    const payload = {
      company_id: companyId,
      customer_id: form.customer_id,
      license_plate: form.license_plate.trim(),
      driver_name: form.driver_name.trim() || null,
      driver_phone: form.driver_phone.trim() || null,
      pickup_license_number: form.pickup_license_number.trim() || null,
    };
    const res = await fetch(form.id ? `/api/customer-vehicles/${form.id}` : '/api/customer-vehicles', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'บันทึกข้อมูลไม่สำเร็จ');
      return;
    }
    setOpen(false);
    setForm(emptyForm);
    await load();
  };

  const remove = async () => {
    if (!deleteId) return;
    setError('');
    const res = await fetch(`/api/customer-vehicles/${deleteId}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'ลบข้อมูลไม่สำเร็จ');
      return;
    }
    setDeleteId(null);
    await load();
  };

  return (
    <Stack spacing={2}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, md: 2 },
          borderRadius: 1,
          border: '1px solid',
          borderColor: '#e5e7eb',
          bgcolor: '#fff',
        }}
      >
        <Stack direction={{ xs: 'column', md: 'row' }} justifyContent='space-between' spacing={1.5}>
          <Box>
            <Typography variant='h5' fontWeight={900}>รถขนส่งลูกค้า</Typography>
            <Typography variant='body2' color='text.secondary'>จัดการทะเบียนรถ คนขับ และข้อมูลรับสินค้าของลูกค้า</Typography>
          </Box>
          <Button variant='contained' startIcon={<Add />} onClick={() => { setForm(emptyForm); setOpen(true); }} sx={{ width: { xs: '100%', md: 'auto' } }}>
            เพิ่มรถขนส่ง
          </Button>
        </Stack>

        <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} sx={{ mt: 2 }}>
          <TextField
            size='small'
            label='ค้นหา'
            placeholder='ลูกค้า, ทะเบียน, คนขับ, เบอร์โทร, ใบอนุญาต'
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setPage(0);
            }}
            sx={{ flex: 1 }}
          />
          <Button variant='outlined' onClick={() => void load()} sx={{ width: { xs: '100%', md: 'auto' } }}>รีเฟรช</Button>
        </Stack>
      </Paper>

      {error ? <Alert severity='error'>{error}</Alert> : null}
      {loading ? <Alert severity='info'>กำลังโหลด...</Alert> : null}

      <Paper elevation={0} sx={{ borderRadius: 1, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
        <Box sx={{ overflowX: 'auto' }}>
          <Table size='small' sx={{ minWidth: 900 }}>
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: '#f8fafc', color: '#334155', fontWeight: 800 } }}>
                <TableCell>ลูกค้า</TableCell>
                <TableCell>ทะเบียนรถ</TableCell>
                <TableCell>ชื่อคนขับ</TableCell>
                <TableCell>เบอร์คนขับ</TableCell>
                <TableCell>เลขใบอนุญาตรับสินค้า</TableCell>
                <TableCell align='right' sx={{ width: 90 }}>จัดการ</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {pagedRows.map((r) => (
                <TableRow key={r.id} hover sx={{ '& td': { borderColor: '#f1f5f9' } }}>
                  <TableCell>{r.customers?.company_name || r.customer_id}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{r.license_plate}</TableCell>
                  <TableCell>{r.driver_name || '-'}</TableCell>
                  <TableCell>{r.driver_phone || '-'}</TableCell>
                  <TableCell>{r.pickup_license_number || '-'}</TableCell>
                  <TableCell align='right'>
                    <Tooltip title='แก้ไข'>
                      <IconButton size='small' onClick={() => {
                        setForm({
                          id: r.id,
                          customer_id: r.customer_id,
                          license_plate: r.license_plate || '',
                          driver_name: r.driver_name || '',
                          driver_phone: r.driver_phone || '',
                          pickup_license_number: r.pickup_license_number || '',
                        });
                        setOpen(true);
                      }}>
                        <Edit fontSize='small' />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title='ลบ'>
                      <IconButton size='small' color='error' onClick={() => setDeleteId(r.id)}>
                        <Delete fontSize='small' />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {!filteredRows.length && !loading ? (
                <TableRow>
                  <TableCell colSpan={6} align='center' sx={{ py: 5, color: 'text.secondary' }}>ไม่มีข้อมูลรถขนส่ง</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </Box>
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
          rowsPerPageOptions={[10, 15, 20, 25, 50]}
          labelRowsPerPage='แถวต่อหน้า'
        />
      </Paper>

      <Drawer anchor='right' open={open} onClose={() => setOpen(false)} PaperProps={{ sx: { width: { xs: '100%', sm: 520 } } }}>
        <Stack spacing={2} sx={{ p: 2 }}>
          <Typography variant='h6' fontWeight={800}>{form.id ? 'แก้ไขรถขนส่ง' : 'เพิ่มรถขนส่ง'}</Typography>
          <TextField
            select
            size='small'
            label='ลูกค้า'
            value={form.customer_id}
            onChange={(e) => setForm((p) => ({ ...p, customer_id: e.target.value }))}
            fullWidth
          >
            {customers.map((c) => <MenuItem key={c.id} value={c.id}>{c.company_name}</MenuItem>)}
          </TextField>
          <TextField
            size='small'
            label='ทะเบียนรถ'
            value={form.license_plate}
            onChange={(e) => setForm((p) => ({ ...p, license_plate: e.target.value }))}
            fullWidth
          />
          <TextField
            size='small'
            label='ชื่อคนขับ'
            value={form.driver_name}
            onChange={(e) => setForm((p) => ({ ...p, driver_name: e.target.value }))}
            fullWidth
          />
          <TextField
            size='small'
            label='เบอร์คนขับ'
            value={form.driver_phone}
            onChange={(e) => setForm((p) => ({ ...p, driver_phone: e.target.value }))}
            fullWidth
          />
          <TextField
            size='small'
            label='เลขใบอนุญาตรับสินค้า'
            value={form.pickup_license_number}
            onChange={(e) => setForm((p) => ({ ...p, pickup_license_number: e.target.value }))}
            fullWidth
          />

          <Stack direction='row' spacing={1} justifyContent='flex-end'>
            <Button onClick={() => setOpen(false)}>ยกเลิก</Button>
            <Button variant='contained' onClick={() => void save()} disabled={!form.customer_id || !form.license_plate.trim()}>
              บันทึก
            </Button>
          </Stack>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบ</DialogTitle>
        <DialogContent>ต้องการลบรถขนส่งนี้ใช่หรือไม่</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>ยกเลิก</Button>
          <Button color='error' onClick={() => void remove()}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

