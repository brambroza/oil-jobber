'use client';

import { useEffect, useState } from 'react';
import AddRounded from '@mui/icons-material/AddRounded';
import DeleteRounded from '@mui/icons-material/DeleteRounded';
import DirectionsCarFilledRounded from '@mui/icons-material/DirectionsCarFilledRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Drawer,
  IconButton,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import CustomerShell from '@/components/layout/CustomerShell';

type VehicleRow = {
  id: string;
  license_plate: string;
  driver_name: string | null;
  driver_phone: string | null;
  pickup_license_number: string | null;
  created_at: string;
};

type VehicleForm = {
  id?: string;
  license_plate: string;
  driver_name: string;
  driver_phone: string;
  pickup_license_number: string;
};

const emptyForm: VehicleForm = {
  license_plate: '',
  driver_name: '',
  driver_phone: '',
  pickup_license_number: '',
};

export default function CustomerVehiclesPage() {
  const [rows, setRows] = useState<VehicleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<VehicleForm>(emptyForm);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError('');
    const res = await fetch('/api/customer-portal/vehicles', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) setError(json.error || 'โหลดข้อมูลรถไม่สำเร็จ');
    else setRows(json || []);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const onSave = async () => {
    setError('');
    const payload = {
      license_plate: form.license_plate,
      driver_name: form.driver_name || null,
      driver_phone: form.driver_phone || null,
      pickup_license_number: form.pickup_license_number || null,
    };

    const res = await fetch(form.id ? `/api/customer-portal/vehicles/${form.id}` : '/api/customer-portal/vehicles', {
      method: form.id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || 'บันทึกข้อมูลรถไม่สำเร็จ');
      return;
    }

    setOpen(false);
    setForm(emptyForm);
    await load();
  };

  const onDelete = async () => {
    if (!deleteId) return;
    const res = await fetch(`/api/customer-portal/vehicles/${deleteId}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || 'ลบข้อมูลรถไม่สำเร็จ');
      return;
    }
    setDeleteId(null);
    await load();
  };

  return (
    <CustomerShell title='รถบรรทุกของฉัน' subtitle='จัดการข้อมูลรถสำหรับรับน้ำมัน'>
      <Stack spacing={1.5}>
        <Stack direction='row' justifyContent='space-between' alignItems='center'>
          <Stack direction='row' spacing={1} alignItems='center'>
            <DirectionsCarFilledRounded sx={{ color: '#1e3a8a' }} />
            <Typography sx={{  display: { xs: 'none', md: 'flex' }, fontSize: 24, fontWeight: 800, color: '#0f2f6e' }}>รถบรรทุกน้ำมันของลูกค้า</Typography>
          </Stack>
          <Button variant='contained' startIcon={<AddRounded />} onClick={() => { setForm(emptyForm); setOpen(true); }}>
            เพิ่มรถ
          </Button>
        </Stack>

        {error ? <Alert severity='error'>{error}</Alert> : null}
        {loading ? <Alert severity='info'>กำลังโหลดข้อมูลรถ...</Alert> : null}

        <Paper sx={{ borderRadius: 2, border: '1px solid #d7e1ef', overflow: 'hidden' }}>
          <Box sx={{ display: { xs: 'none', md: 'block' }, overflowX: 'auto' }}>
            <Table size='small'>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#f8fbff', fontWeight: 800 } }}>
                  <TableCell>ทะเบียนรถ</TableCell>
                  <TableCell>ชื่อคนขับ</TableCell>
                  <TableCell>เบอร์คนขับ</TableCell>
                  <TableCell>เลขใบอนุญาตรับสินค้า</TableCell>
                  <TableCell align='right'>จัดการ</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} hover>
                    <TableCell sx={{ fontWeight: 700 }}>{r.license_plate}</TableCell>
                    <TableCell>{r.driver_name || '-'}</TableCell>
                    <TableCell>{r.driver_phone || '-'}</TableCell>
                    <TableCell>{r.pickup_license_number || '-'}</TableCell>
                    <TableCell align='right'>
                      <IconButton onClick={() => { setForm({ id: r.id, license_plate: r.license_plate, driver_name: r.driver_name || '', driver_phone: r.driver_phone || '', pickup_license_number: r.pickup_license_number || '' }); setOpen(true); }}>
                        <EditRounded fontSize='small' />
                      </IconButton>
                      <IconButton color='error' onClick={() => setDeleteId(r.id)}>
                        <DeleteRounded fontSize='small' />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
                {!rows.length && !loading ? (
                  <TableRow><TableCell colSpan={5} align='center'>ยังไม่มีข้อมูลรถบรรทุก</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
          </Box>
          <Stack sx={{ display: { xs: 'flex', md: 'none' }, p: 1 }} spacing={0.9}>
            {rows.map((r) => (
              <Card key={r.id} variant='outlined' sx={{ borderColor: '#e2e8f0', borderRadius: 2, boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)' }}>
                <CardContent sx={{ p: 1.15, '&:last-child': { pb: 1.15 } }}>
                  <Stack spacing={0.6}>
                    <Stack direction='row' justifyContent='space-between' spacing={1}>
                      <Typography sx={{ fontSize: 11.5, color: '#64748b' }}>ทะเบียนรถ</Typography>
                      <Typography sx={{ fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{r.license_plate}</Typography>
                    </Stack>
                    <Stack direction='row' justifyContent='space-between' spacing={1}>
                      <Typography sx={{ fontSize: 11.5, color: '#64748b' }}>ชื่อคนขับ</Typography>
                      <Typography sx={{ fontSize: 12.5, color: '#1f2937' }}>{r.driver_name || '-'}</Typography>
                    </Stack>
                    <Stack direction='row' justifyContent='space-between' spacing={1}>
                      <Typography sx={{ fontSize: 11.5, color: '#64748b' }}>เบอร์คนขับ</Typography>
                      <Typography sx={{ fontSize: 12.5, color: '#1f2937' }}>{r.driver_phone || '-'}</Typography>
                    </Stack>
                    <Stack direction='row' justifyContent='space-between' spacing={1}>
                      <Typography sx={{ fontSize: 11.5, color: '#64748b' }}>เลขใบอนุญาตรับสินค้า</Typography>
                      <Typography sx={{ fontSize: 12.5, color: '#1f2937' }}>{r.pickup_license_number || '-'}</Typography>
                    </Stack>
                    <Stack direction='row' justifyContent='flex-end' spacing={0.75} sx={{ pt: 0.1 }}>
                      <IconButton onClick={() => { setForm({ id: r.id, license_plate: r.license_plate, driver_name: r.driver_name || '', driver_phone: r.driver_phone || '', pickup_license_number: r.pickup_license_number || '' }); setOpen(true); }} sx={{ border: '1px solid #e2e8f0', borderRadius: 1.5 }}>
                        <EditRounded fontSize='small' />
                      </IconButton>
                      <IconButton color='error' onClick={() => setDeleteId(r.id)} sx={{ border: '1px solid #fecaca', borderRadius: 1.5 }}>
                        <DeleteRounded fontSize='small' />
                      </IconButton>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
            {!rows.length && !loading ? <Alert severity='info'>ยังไม่มีข้อมูลรถบรรทุก</Alert> : null}
          </Stack>
        </Paper>
      </Stack>

      <Drawer anchor='right' open={open} onClose={() => setOpen(false)}>
        <Stack spacing={2} sx={{ width: { xs: 330, sm: 460 }, p: 2 }}>
          <Typography variant='h6'>{form.id ? 'แก้ไขข้อมูลรถ' : 'เพิ่มข้อมูลรถ'}</Typography>
          <TextField label='ทะเบียนรถ' value={form.license_plate} onChange={(e) => setForm((p) => ({ ...p, license_plate: e.target.value }))} required />
          <TextField label='ชื่อคนขับ' value={form.driver_name} onChange={(e) => setForm((p) => ({ ...p, driver_name: e.target.value }))} />
          <TextField label='เบอร์คนขับ' value={form.driver_phone} onChange={(e) => setForm((p) => ({ ...p, driver_phone: e.target.value }))} />
          <TextField label='เลขใบอนุญาตรับสินค้า' value={form.pickup_license_number} onChange={(e) => setForm((p) => ({ ...p, pickup_license_number: e.target.value }))} />
          <Button variant='contained' onClick={() => void onSave()} disabled={!form.license_plate.trim()}>บันทึก</Button>
        </Stack>
      </Drawer>

      <Dialog open={Boolean(deleteId)} onClose={() => setDeleteId(null)}>
        <DialogTitle>ยืนยันการลบรถ</DialogTitle>
        <DialogContent>ต้องการลบข้อมูลรถคันนี้ใช่หรือไม่</DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteId(null)}>ยกเลิก</Button>
          <Button color='error' onClick={() => void onDelete()}>ลบ</Button>
        </DialogActions>
      </Dialog>
    </CustomerShell>
  );
}
